from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import base64
import json
from datetime import datetime
from werkzeug.utils import secure_filename
from openai import OpenAI
from dotenv import load_dotenv
import uuid
from contextlib import contextmanager

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}
DATABASE = 'invoice_database.db'
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

# Use /tmp for serverless environments, otherwise use local uploads folder
if os.path.exists('/tmp'):
    UPLOAD_FOLDER = '/tmp/invoice_uploads'
else:
    UPLOAD_FOLDER = 'uploads'

client = None
if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY)

try:
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
except OSError:
    UPLOAD_FOLDER = '/tmp'

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@contextmanager
def get_db_connection():
    conn = None
    try:
        conn = sqlite3.connect(DATABASE, timeout=20.0)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA busy_timeout=20000')
        yield conn
        conn.commit()
    except sqlite3.Error as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.close()

def init_db():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS SalesOrderHeader (
                SalesOrderID INTEGER PRIMARY KEY AUTOINCREMENT,
                SalesOrderNumber TEXT UNIQUE,
                OrderDate TEXT,
                DueDate TEXT,
                ShipDate TEXT,
                Status INTEGER DEFAULT 1,
                PurchaseOrderNumber TEXT,
                CustomerID INTEGER,
                CustomerName TEXT,
                CustomerCompany TEXT,
                CustomerAddress TEXT,
                CustomerCityStateZip TEXT,
                CustomerPhone TEXT,
                VendorName TEXT,
                VendorCompany TEXT,
                VendorAddress TEXT,
                VendorCityStateZip TEXT,
                VendorPhone TEXT,
                VendorFax TEXT,
                VendorWebsite TEXT,
                SalesPerson TEXT,
                ShipToName TEXT,
                ShipToCompany TEXT,
                ShipToAddress TEXT,
                ShipToCityStateZip TEXT,
                ShipToPhone TEXT,
                SubTotal REAL DEFAULT 0,
                TaxRate REAL DEFAULT 0,
                TaxAmt REAL DEFAULT 0,
                ShippingHandling REAL DEFAULT 0,
                Other REAL DEFAULT 0,
                TotalDue REAL DEFAULT 0,
                Terms TEXT,
                ShipVia TEXT,
                FOB TEXT,
                CreatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS SalesOrderDetail (
                SalesOrderDetailID INTEGER PRIMARY KEY AUTOINCREMENT,
                SalesOrderID INTEGER,
                ItemNumber TEXT,
                Description TEXT,
                Quantity INTEGER,
                UnitPrice REAL,
                LineTotal REAL,
                FOREIGN KEY (SalesOrderID) REFERENCES SalesOrderHeader(SalesOrderID) ON DELETE CASCADE
            )
        ''')

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def extract_invoice_data(image_path):
    if not client:
        raise Exception("API key not configured")
    
    try:
        base64_image = encode_image(image_path)
        prompt = """Extract all information from this invoice and return a JSON object with the following structure:
{
  "invoiceNumber": "invoice number or ID",
  "invoiceDate": "date in YYYY-MM-DD format",
  "dueDate": "due date in YYYY-MM-DD format or null",
  "vendor": {
    "name": "vendor/company name",
    "company": "company name if different",
    "address": "street address",
    "cityStateZip": "city, state zip",
    "phone": "phone number",
    "fax": "fax number if available",
    "website": "website if available"
  },
  "customer": {
    "name": "customer/bill to name",
    "company": "company name if different",
    "address": "street address",
    "cityStateZip": "city, state zip",
    "phone": "phone number"
  },
  "shipTo": {
    "name": "ship to name if different from customer",
    "company": "company name",
    "address": "street address",
    "cityStateZip": "city, state zip",
    "phone": "phone number"
  },
  "shipping": {
    "salesPerson": "salesperson name if available",
    "poNumber": "purchase order number if available",
    "shipDate": "ship date in YYYY-MM-DD format or null",
    "shipVia": "shipping method if available",
    "fob": "FOB if available",
    "terms": "payment terms if available"
  },
  "lineItems": [
    {
      "itemNumber": "item number or SKU",
      "description": "product description",
      "quantity": number,
      "unitPrice": number,
      "lineTotal": number
    }
  ],
  "totals": {
    "subtotal": number,
    "taxRate": number (as percentage, e.g., 6.875 for 6.875%),
    "tax": number,
    "shippingHandling": number or 0,
    "other": number or 0,
    "total": number
  }
}

Return ONLY valid JSON, no additional text or markdown formatting."""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=2000,
            temperature=0.1
        )
        
        content = response.choices[0].message.content.strip()
        
        if content.startswith('```json'):
            content = content[7:]
        if content.startswith('```'):
            content = content[3:]
        if content.endswith('```'):
            content = content[:-3]
        content = content.strip()
        
        extracted_data = json.loads(content)
        return extracted_data
        
    except Exception as e:
        raise Exception(f"Error extracting invoice data: {str(e)}")

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Allowed: PNG, JPG, JPEG, PDF'}), 400
    
    try:
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)
        
        extracted_data = extract_invoice_data(filepath)

        # Clean up temp file
        try:
            os.remove(filepath)
        except:
            pass
        
        return jsonify({
            'success': True,
            'data': extracted_data,
            'filename': unique_filename
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/orders', methods=['GET'])
def get_orders():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT SalesOrderID, SalesOrderNumber, OrderDate, CustomerName, 
                       CustomerCompany, TotalDue, CreatedAt
                FROM SalesOrderHeader
                ORDER BY CreatedAt DESC
            ''')
            
            orders = [dict(row) for row in cursor.fetchall()]
        
        return jsonify(orders)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/orders/<int:order_id>', methods=['GET'])
def get_order(order_id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('SELECT * FROM SalesOrderHeader WHERE SalesOrderID = ?', (order_id,))
            header = cursor.fetchone()
            
            if not header:
                return jsonify({'error': 'Order not found'}), 404
            
            cursor.execute('''
                SELECT * FROM SalesOrderDetail 
                WHERE SalesOrderID = ? 
                ORDER BY SalesOrderDetailID
            ''', (order_id,))
            
            line_items = [dict(row) for row in cursor.fetchall()]
        
        return jsonify({
            'header': dict(header),
            'lineItems': line_items
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/orders', methods=['POST'])
def create_order():
    try:
        data = request.json
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            sales_order_number = data.get('invoiceNumber') or f"SO-{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            cursor.execute('''
                INSERT INTO SalesOrderHeader (
                    SalesOrderNumber, OrderDate, DueDate, ShipDate, PurchaseOrderNumber,
                    CustomerName, CustomerCompany, CustomerAddress, CustomerCityStateZip, CustomerPhone,
                    VendorName, VendorCompany, VendorAddress, VendorCityStateZip, VendorPhone, VendorFax, VendorWebsite,
                    SalesPerson, ShipToName, ShipToCompany, ShipToAddress, ShipToCityStateZip, ShipToPhone,
                    SubTotal, TaxRate, TaxAmt, ShippingHandling, Other, TotalDue,
                    Terms, ShipVia, FOB
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                sales_order_number,
                data.get('invoiceDate'),
                data.get('dueDate'),
                data.get('shipping', {}).get('shipDate'),
                data.get('shipping', {}).get('poNumber'),
                data.get('customer', {}).get('name'),
                data.get('customer', {}).get('company'),
                data.get('customer', {}).get('address'),
                data.get('customer', {}).get('cityStateZip'),
                data.get('customer', {}).get('phone'),
                data.get('vendor', {}).get('name'),
                data.get('vendor', {}).get('company'),
                data.get('vendor', {}).get('address'),
                data.get('vendor', {}).get('cityStateZip'),
                data.get('vendor', {}).get('phone'),
                data.get('vendor', {}).get('fax'),
                data.get('vendor', {}).get('website'),
                data.get('shipping', {}).get('salesPerson'),
                data.get('shipTo', {}).get('name'),
                data.get('shipTo', {}).get('company'),
                data.get('shipTo', {}).get('address'),
                data.get('shipTo', {}).get('cityStateZip'),
                data.get('shipTo', {}).get('phone'),
                data.get('totals', {}).get('subtotal', 0),
                data.get('totals', {}).get('taxRate', 0),
                data.get('totals', {}).get('tax', 0),
                data.get('totals', {}).get('shippingHandling', 0),
                data.get('totals', {}).get('other', 0),
                data.get('totals', {}).get('total', 0),
                data.get('shipping', {}).get('terms'),
                data.get('shipping', {}).get('shipVia'),
                data.get('shipping', {}).get('fob')
            ))
            
            order_id = cursor.lastrowid
            
            for item in data.get('lineItems', []):
                cursor.execute('''
                    INSERT INTO SalesOrderDetail (
                        SalesOrderID, ItemNumber, Description, Quantity, UnitPrice, LineTotal
                    ) VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    order_id,
                    item.get('itemNumber'),
                    item.get('description'),
                    item.get('quantity', 0),
                    item.get('unitPrice', 0),
                    item.get('lineTotal', 0)
                ))
        
        return jsonify({'success': True, 'orderId': order_id}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/orders/<int:order_id>', methods=['PUT'])
def update_order(order_id):
    try:
        data = request.json
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('SELECT SalesOrderID FROM SalesOrderHeader WHERE SalesOrderID = ?', (order_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Order not found'}), 404
            
            cursor.execute('''
                UPDATE SalesOrderHeader SET
                    SalesOrderNumber = ?, OrderDate = ?, DueDate = ?, ShipDate = ?, PurchaseOrderNumber = ?,
                    CustomerName = ?, CustomerCompany = ?, CustomerAddress = ?, CustomerCityStateZip = ?, CustomerPhone = ?,
                    VendorName = ?, VendorCompany = ?, VendorAddress = ?, VendorCityStateZip = ?, VendorPhone = ?, VendorFax = ?, VendorWebsite = ?,
                    SalesPerson = ?, ShipToName = ?, ShipToCompany = ?, ShipToAddress = ?, ShipToCityStateZip = ?, ShipToPhone = ?,
                    SubTotal = ?, TaxRate = ?, TaxAmt = ?, ShippingHandling = ?, Other = ?, TotalDue = ?,
                    Terms = ?, ShipVia = ?, FOB = ?
                WHERE SalesOrderID = ?
            ''', (
                data.get('invoiceNumber') or data.get('salesOrderNumber'),
                data.get('invoiceDate') or data.get('orderDate'),
                data.get('dueDate'),
                data.get('shipDate'),
                data.get('purchaseOrderNumber'),
                data.get('customerName'),
                data.get('customerCompany'),
                data.get('customerAddress'),
                data.get('customerCityStateZip'),
                data.get('customerPhone'),
                data.get('vendorName'),
                data.get('vendorCompany'),
                data.get('vendorAddress'),
                data.get('vendorCityStateZip'),
                data.get('vendorPhone'),
                data.get('vendorFax'),
                data.get('vendorWebsite'),
                data.get('salesPerson'),
                data.get('shipToName'),
                data.get('shipToCompany'),
                data.get('shipToAddress'),
                data.get('shipToCityStateZip'),
                data.get('shipToPhone'),
                data.get('subTotal'),
                data.get('taxRate'),
                data.get('taxAmt'),
                data.get('shippingHandling'),
                data.get('other'),
                data.get('totalDue'),
                data.get('terms'),
                data.get('shipVia'),
                data.get('fob'),
                order_id
            ))
            
            cursor.execute('DELETE FROM SalesOrderDetail WHERE SalesOrderID = ?', (order_id,))
            
            for item in data.get('lineItems', []):
                cursor.execute('''
                    INSERT INTO SalesOrderDetail (
                        SalesOrderID, ItemNumber, Description, Quantity, UnitPrice, LineTotal
                    ) VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    order_id,
                    item.get('itemNumber'),
                    item.get('description'),
                    item.get('quantity', 0),
                    item.get('unitPrice', 0),
                    item.get('lineTotal', 0)
                ))
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/orders/<int:order_id>', methods=['DELETE'])
def delete_order(order_id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('DELETE FROM SalesOrderHeader WHERE SalesOrderID = ?', (order_id,))
            
            if cursor.rowcount == 0:
                return jsonify({'error': 'Order not found'}), 404
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'}), 200

if __name__ == '__main__':
    init_db()
    
    if not client:
        print("Warning: OPENAI_API_KEY not found")
    
    app.run(debug=True, port=5000)

