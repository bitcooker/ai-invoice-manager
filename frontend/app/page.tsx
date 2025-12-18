'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Upload, Loader2, Plus, Trash2, Eye, RefreshCw } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

const API_URL = 'http://localhost:5000/api'

interface LineItem {
  itemNumber: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

interface InvoiceData {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  vendor: {
    name: string
    company: string
    address: string
    cityStateZip: string
    phone: string
    fax: string
    website: string
  }
  customer: {
    name: string
    company: string
    address: string
    cityStateZip: string
    phone: string
  }
  shipTo: {
    name: string
    company: string
    address: string
    cityStateZip: string
    phone: string
  }
  shipping: {
    salesPerson: string
    poNumber: string
    shipDate: string
    shipVia: string
    fob: string
    terms: string
  }
  lineItems: LineItem[]
  totals: {
    subtotal: number
    taxRate: number
    tax: number
    shippingHandling: number
    other: number
    total: number
  }
}

interface Order {
  SalesOrderID: number
  SalesOrderNumber: string
  OrderDate: string
  CustomerName: string
  CustomerCompany: string
  TotalDue: number
  CreatedAt: string
}

export default function Home() {
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [extractedData, setExtractedData] = useState<InvoiceData | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      const response = await axios.get(`${API_URL}/orders`)
      setOrders(response.data)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.response?.data?.error || 'Failed to load orders',
      })
    } finally {
      setLoadingOrders(false)
    }
  }, [toast])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setUploading(true)
    setExtractedData(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setExtractedData(response.data.data)
      toast({
        title: "Success",
        description: "Invoice data extracted successfully!",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.response?.data?.error || 'Failed to extract invoice data',
      })
    } finally {
      setUploading(false)
    }
  }, [toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  })

  const handleInputChange = (path: string[], value: any) => {
    if (!extractedData) return

    const newData = { ...extractedData }
    let current: any = newData

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]]
    }

    current[path[path.length - 1]] = value
    setExtractedData(newData)
  }

  const handleLineItemChange = (index: number, field: keyof LineItem, value: any) => {
    if (!extractedData) return

    const newLineItems = [...extractedData.lineItems]
    newLineItems[index] = { ...newLineItems[index], [field]: value }

    // Recalculate line total
    if (field === 'quantity' || field === 'unitPrice') {
      newLineItems[index].lineTotal = newLineItems[index].quantity * newLineItems[index].unitPrice
    }

    // Recalculate subtotal
    const subtotal = newLineItems.reduce((sum: number, item: LineItem) => sum + item.lineTotal, 0)
    const tax = subtotal * (extractedData.totals.taxRate / 100)
    const total = subtotal + tax + extractedData.totals.shippingHandling + extractedData.totals.other

    setExtractedData({
      ...extractedData,
      lineItems: newLineItems,
      totals: {
        ...extractedData.totals,
        subtotal,
        tax,
        total,
      },
    })
  }

  const handleAddLineItem = () => {
    if (!extractedData) return

    setExtractedData({
      ...extractedData,
      lineItems: [
        ...extractedData.lineItems,
        {
          itemNumber: '',
          description: '',
          quantity: 1,
          unitPrice: 0,
          lineTotal: 0,
        },
      ],
    })
  }

  const handleRemoveLineItem = (index: number) => {
    if (!extractedData) return

    const newLineItems = extractedData.lineItems.filter((_item: LineItem, i: number) => i !== index)
    const subtotal = newLineItems.reduce((sum: number, item: LineItem) => sum + item.lineTotal, 0)
    const tax = subtotal * (extractedData.totals.taxRate / 100)
    const total = subtotal + tax + extractedData.totals.shippingHandling + extractedData.totals.other

    setExtractedData({
      ...extractedData,
      lineItems: newLineItems,
      totals: {
        ...extractedData.totals,
        subtotal,
        tax,
        total,
      },
    })
  }

  const handleSave = async () => {
    if (!extractedData) return

    setSaving(true)

    try {
      await axios.post(`${API_URL}/orders`, extractedData)
      setExtractedData(null)
      setSelectedOrderId(null)
      await loadOrders()
      toast({
        title: "Success",
        description: "Invoice saved successfully!",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.response?.data?.error || 'Failed to save invoice',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleViewOrder = async (orderId: number) => {
    try {
      const response = await axios.get(`${API_URL}/orders/${orderId}`)
      const order = response.data

      // Convert database format to form format
      const formData: InvoiceData = {
        invoiceNumber: order.header.SalesOrderNumber,
        invoiceDate: order.header.OrderDate || '',
        dueDate: order.header.DueDate || '',
        vendor: {
          name: order.header.VendorName || '',
          company: order.header.VendorCompany || '',
          address: order.header.VendorAddress || '',
          cityStateZip: order.header.VendorCityStateZip || '',
          phone: order.header.VendorPhone || '',
          fax: order.header.VendorFax || '',
          website: order.header.VendorWebsite || '',
        },
        customer: {
          name: order.header.CustomerName || '',
          company: order.header.CustomerCompany || '',
          address: order.header.CustomerAddress || '',
          cityStateZip: order.header.CustomerCityStateZip || '',
          phone: order.header.CustomerPhone || '',
        },
        shipTo: {
          name: order.header.ShipToName || '',
          company: order.header.ShipToCompany || '',
          address: order.header.ShipToAddress || '',
          cityStateZip: order.header.ShipToCityStateZip || '',
          phone: order.header.ShipToPhone || '',
        },
        shipping: {
          salesPerson: order.header.SalesPerson || '',
          poNumber: order.header.PurchaseOrderNumber || '',
          shipDate: order.header.ShipDate || '',
          shipVia: order.header.ShipVia || '',
          fob: order.header.FOB || '',
          terms: order.header.Terms || '',
        },
        lineItems: order.lineItems.map((item: any) => ({
          itemNumber: item.ItemNumber || '',
          description: item.Description || '',
          quantity: item.Quantity || 0,
          unitPrice: item.UnitPrice || 0,
          lineTotal: item.LineTotal || 0,
        })),
        totals: {
          subtotal: order.header.SubTotal || 0,
          taxRate: order.header.TaxRate || 0,
          tax: order.header.TaxAmt || 0,
          shippingHandling: order.header.ShippingHandling || 0,
          other: order.header.Other || 0,
          total: order.header.TotalDue || 0,
        },
      }

      setExtractedData(formData)
      setSelectedOrderId(orderId)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.response?.data?.error || 'Failed to load order',
      })
    }
  }

  const handleUpdate = async () => {
    if (!extractedData || !selectedOrderId) return

    setSaving(true)

    try {
      // Convert form format to database format
      const updateData = {
        invoiceNumber: extractedData.invoiceNumber,
        invoiceDate: extractedData.invoiceDate,
        dueDate: extractedData.dueDate,
        purchaseOrderNumber: extractedData.shipping.poNumber,
        customerName: extractedData.customer.name,
        customerCompany: extractedData.customer.company,
        customerAddress: extractedData.customer.address,
        customerCityStateZip: extractedData.customer.cityStateZip,
        customerPhone: extractedData.customer.phone,
        vendorName: extractedData.vendor.name,
        vendorCompany: extractedData.vendor.company,
        vendorAddress: extractedData.vendor.address,
        vendorCityStateZip: extractedData.vendor.cityStateZip,
        vendorPhone: extractedData.vendor.phone,
        vendorFax: extractedData.vendor.fax,
        vendorWebsite: extractedData.vendor.website,
        salesPerson: extractedData.shipping.salesPerson,
        shipToName: extractedData.shipTo.name,
        shipToCompany: extractedData.shipTo.company,
        shipToAddress: extractedData.shipTo.address,
        shipToCityStateZip: extractedData.shipTo.cityStateZip,
        shipToPhone: extractedData.shipTo.phone,
        subTotal: extractedData.totals.subtotal,
        taxRate: extractedData.totals.taxRate,
        taxAmt: extractedData.totals.tax,
        shippingHandling: extractedData.totals.shippingHandling,
        other: extractedData.totals.other,
        totalDue: extractedData.totals.total,
        terms: extractedData.shipping.terms,
        shipVia: extractedData.shipping.shipVia,
        fob: extractedData.shipping.fob,
        shipDate: extractedData.shipping.shipDate,
        lineItems: extractedData.lineItems,
      }

      await axios.put(`${API_URL}/orders/${selectedOrderId}`, updateData)
      await loadOrders()
      toast({
        title: "Success",
        description: "Order updated successfully!",
      })
      setSelectedOrderId(null)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.response?.data?.error || 'Failed to update order',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClick = (orderId: number) => {
    setOrderToDelete(orderId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!orderToDelete) return

    try {
      await axios.delete(`${API_URL}/orders/${orderToDelete}`)
      await loadOrders()
      if (selectedOrderId === orderToDelete) {
        setExtractedData(null)
        setSelectedOrderId(null)
      }
      toast({
        title: "Success",
        description: "Order deleted successfully!",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.response?.data?.error || 'Failed to delete order',
      })
    } finally {
      setDeleteDialogOpen(false)
      setOrderToDelete(null)
    }
  }

  const handleNewInvoice = () => {
    setExtractedData(null)
    setSelectedOrderId(null)
  }

  const totalPages = Math.ceil(orders.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedOrders = orders.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: document.getElementById('orders-section')?.offsetTop || 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const maxPage = Math.ceil(orders.length / itemsPerPage)
    if (currentPage > maxPage && maxPage > 0) {
      setCurrentPage(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length])

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const maxVisiblePages = 5

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      pages.push(1)

      if (currentPage > 3) {
        pages.push('ellipsis')
      }

      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (currentPage < totalPages - 2) {
        pages.push('ellipsis')
      }

      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-foreground">
              Invoice Manager
            </h1>
            <p className="text-muted-foreground">
              Upload, extract, and manage invoice data
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Upload Section */}
        {!extractedData && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Invoice</CardTitle>
              <CardDescription>
                Drag and drop an invoice image or click to select a file
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input {...getInputProps()} disabled={uploading} />
                {uploading ? (
                  <div className="space-y-4">
                    <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
                    <p className="text-muted-foreground">Processing invoice...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
                    <div>
                      <p className="text-sm font-medium">
                        {isDragActive
                          ? 'Drop the invoice here'
                          : 'Drag and drop an invoice, or click to select'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG, JPEG, PDF
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Form Section */}
        {extractedData && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>
                    {selectedOrderId ? 'Edit Invoice' : 'Extracted Invoice Data'}
                  </CardTitle>
                  <CardDescription>
                    Review and edit the extracted information before saving
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={handleNewInvoice}>
                  New Invoice
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Invoice Info & Vendor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Invoice Information</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoiceNumber">Invoice Number</Label>
                      <Input
                        id="invoiceNumber"
                        value={extractedData.invoiceNumber}
                        onChange={(e) => handleInputChange(['invoiceNumber'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invoiceDate">Invoice Date</Label>
                      <Input
                        id="invoiceDate"
                        type="date"
                        value={extractedData.invoiceDate}
                        onChange={(e) => handleInputChange(['invoiceDate'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Due Date</Label>
                      <Input
                        id="dueDate"
                        type="date"
                        value={extractedData.dueDate}
                        onChange={(e) => handleInputChange(['dueDate'], e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Vendor Information</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="vendorName">Name</Label>
                      <Input
                        id="vendorName"
                        value={extractedData.vendor.name}
                        onChange={(e) => handleInputChange(['vendor', 'name'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vendorCompany">Company</Label>
                      <Input
                        id="vendorCompany"
                        value={extractedData.vendor.company}
                        onChange={(e) => handleInputChange(['vendor', 'company'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vendorAddress">Address</Label>
                      <Input
                        id="vendorAddress"
                        value={extractedData.vendor.address}
                        onChange={(e) => handleInputChange(['vendor', 'address'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vendorCityStateZip">City, State ZIP</Label>
                      <Input
                        id="vendorCityStateZip"
                        value={extractedData.vendor.cityStateZip}
                        onChange={(e) => handleInputChange(['vendor', 'cityStateZip'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vendorPhone">Phone</Label>
                      <Input
                        id="vendorPhone"
                        value={extractedData.vendor.phone}
                        onChange={(e) => handleInputChange(['vendor', 'phone'], e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer & Shipping */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Customer Information</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="customerName">Name</Label>
                      <Input
                        id="customerName"
                        value={extractedData.customer.name}
                        onChange={(e) => handleInputChange(['customer', 'name'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerCompany">Company</Label>
                      <Input
                        id="customerCompany"
                        value={extractedData.customer.company}
                        onChange={(e) => handleInputChange(['customer', 'company'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerAddress">Address</Label>
                      <Input
                        id="customerAddress"
                        value={extractedData.customer.address}
                        onChange={(e) => handleInputChange(['customer', 'address'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerCityStateZip">City, State ZIP</Label>
                      <Input
                        id="customerCityStateZip"
                        value={extractedData.customer.cityStateZip}
                        onChange={(e) => handleInputChange(['customer', 'cityStateZip'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerPhone">Phone</Label>
                      <Input
                        id="customerPhone"
                        value={extractedData.customer.phone}
                        onChange={(e) => handleInputChange(['customer', 'phone'], e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Shipping Information</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="salesPerson">Salesperson</Label>
                      <Input
                        id="salesPerson"
                        value={extractedData.shipping.salesPerson}
                        onChange={(e) => handleInputChange(['shipping', 'salesPerson'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="poNumber">PO Number</Label>
                      <Input
                        id="poNumber"
                        value={extractedData.shipping.poNumber}
                        onChange={(e) => handleInputChange(['shipping', 'poNumber'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shipDate">Ship Date</Label>
                      <Input
                        id="shipDate"
                        type="date"
                        value={extractedData.shipping.shipDate}
                        onChange={(e) => handleInputChange(['shipping', 'shipDate'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shipVia">Ship Via</Label>
                      <Input
                        id="shipVia"
                        value={extractedData.shipping.shipVia}
                        onChange={(e) => handleInputChange(['shipping', 'shipVia'], e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="terms">Terms</Label>
                      <Input
                        id="terms"
                        value={extractedData.shipping.terms}
                        onChange={(e) => handleInputChange(['shipping', 'terms'], e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Line Items</h3>
                  <Button onClick={handleAddLineItem} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item #</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extractedData.lineItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Input
                              value={item.itemNumber}
                              onChange={(e) => handleLineItemChange(index, 'itemNumber', e.target.value)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.description}
                              onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => handleLineItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>${item.lineTotal.toFixed(2)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLineItem(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full md:w-1/2 space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Subtotal:</span>
                    <span>${extractedData.totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Tax Rate (%):</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={extractedData.totals.taxRate}
                      onChange={(e) => {
                        const newTaxRate = parseFloat(e.target.value) || 0
                        const tax = extractedData.totals.subtotal * (newTaxRate / 100)
                        const total = extractedData.totals.subtotal + tax + extractedData.totals.shippingHandling + extractedData.totals.other
                        setExtractedData({
                          ...extractedData,
                          totals: {
                            ...extractedData.totals,
                            taxRate: newTaxRate,
                            tax,
                            total,
                          },
                        })
                      }}
                      className="w-24"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Tax:</span>
                    <span>${extractedData.totals.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Shipping & Handling:</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={extractedData.totals.shippingHandling}
                      onChange={(e) => {
                        const newShipping = parseFloat(e.target.value) || 0
                        const total = extractedData.totals.subtotal + extractedData.totals.tax + newShipping + extractedData.totals.other
                        setExtractedData({
                          ...extractedData,
                          totals: {
                            ...extractedData.totals,
                            shippingHandling: newShipping,
                            total,
                          },
                        })
                      }}
                      className="w-24"
                    />
                  </div>
                  <div className="flex justify-between border-t-2 pt-2">
                    <span className="font-bold text-lg">Total:</span>
                    <span className="font-bold text-lg">${extractedData.totals.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                {selectedOrderId ? (
                  <Button onClick={handleUpdate} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update in Database'
                    )}
                  </Button>
                ) : (
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save to Database'
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Orders List */}
        <Card id="orders-section">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Saved Orders</CardTitle>
                <CardDescription>
                  View and manage all saved invoices
                  {orders.length > 0 && (
                    <span className="ml-2">
                      ({orders.length} total{orders.length !== paginatedOrders.length ? `, showing ${startIndex + 1}-${Math.min(endIndex, orders.length)}` : ''})
                    </span>
                  )}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadOrders}
                disabled={loadingOrders}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingOrders ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders in database yet.
              </div>
            ) : (
              <>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Order Number</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedOrders.map((order) => (
                        <TableRow key={order.SalesOrderID}>
                          <TableCell>{order.SalesOrderID}</TableCell>
                          <TableCell className="font-medium">{order.SalesOrderNumber}</TableCell>
                          <TableCell>{order.OrderDate}</TableCell>
                          <TableCell>
                            {order.CustomerName}
                            {order.CustomerCompany && (
                              <span className="text-muted-foreground"> ({order.CustomerCompany})</span>
                            )}
                          </TableCell>
                          <TableCell>${order.TotalDue?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewOrder(order.SalesOrderID)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(order.SalesOrderID)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => handlePageChange(currentPage - 1)}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>

                      {getPageNumbers().map((page, index) => (
                        <PaginationItem key={index}>
                          {page === 'ellipsis' ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              onClick={() => handlePageChange(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => handlePageChange(currentPage + 1)}
                          className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the order from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
