# Invoice Manager

A simple app to upload invoices, extract the data, and save them to a database. Built with Next.js and Flask.

## What it does

Upload an invoice image and it'll extract all the key info - vendor details, customer info, line items, totals, etc. You can review and edit everything before saving it to the database.

## Tech

**Frontend:** Next.js, TypeScript, TailwindCSS, shadcn/ui  
**Backend:** Flask, SQLite, OpenAI API

## Setup

You'll need Node.js 18+ and Python 3.8+.

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
# or: source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
```

Create a `.env` file in the backend directory:
```
OPENAI_API_KEY=your-api-key-here
```

### Frontend

```bash
cd frontend
npm install
```

## Running it

Start the backend first:
```bash
cd backend
python app.py
```

Then in another terminal, start the frontend:
```bash
cd frontend
npm run dev
```

Open http://localhost:3000 in your browser.

## Usage

Just drag and drop an invoice image. The app will extract the data, show it in a form where you can edit anything, then save it to the database. You can view, edit, or delete saved invoices from the table.

## API

- `POST /api/upload` - Upload invoice and extract data
- `GET /api/orders` - Get all orders
- `GET /api/orders/<id>` - Get specific order
- `POST /api/orders` - Create new order
- `PUT /api/orders/<id>` - Update order
- `DELETE /api/orders/<id>` - Delete order

## Database

Two tables: `SalesOrderHeader` for invoice info and `SalesOrderDetail` for line items. Pretty standard setup.
