/**
 * PurchaseBatchModal - 批量购买胶片的模态框
 * 
 * 使用 HeroUI Modal + Form 组件实现现代化表单
 * 支持多行胶片录入、运费分摊计算
 */

import React, { useState, useMemo } from 'react';
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  Divider,
  Chip,
  Card,
  CardBody,
  ScrollShadow
} from '@heroui/react';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  Store, 
  Truck, 
  FileText, 
  Disc3,
  Hash,
  DollarSign,
  Package
} from 'lucide-react';

// Empty item template
const EMPTY_ITEM = {
  film_id: '',
  quantity: 1,
  unit_price: '',
  expiry_date: '',
  batch_code: '',
  label: ''
};

export default function PurchaseBatchModal({
  isOpen,
  onClose,
  onSubmit,
  films = [],
  isLoading = false
}) {
  const [form, setForm] = useState({
    order_date: new Date().toISOString().slice(0, 10),
    channel: '',
    vendor: '',
    shipping_cost: '',
    notes: '',
    items: [{ ...EMPTY_ITEM }]
  });

  // Calculate totals
  const { totalQuantity, totalCost, perItemShipping } = useMemo(() => {
    const qty = form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const shipping = Number(form.shipping_cost || 0);
    const perItem = qty > 0 ? shipping / qty : 0;
    const itemsCost = form.items.reduce((sum, item) => {
      return sum + (Number(item.quantity || 0) * Number(item.unit_price || 0));
    }, 0);
    return {
      totalQuantity: qty,
      totalCost: itemsCost + shipping,
      perItemShipping: perItem
    };
  }, [form.items, form.shipping_cost]);

  const updateField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateItem = (index, patch) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, ...patch } : item)
    }));
  };

  const addRow = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { ...EMPTY_ITEM }]
    }));
  };

  const removeRow = (index) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = () => {
    onSubmit?.({
      purchase_date: form.order_date || null,
      purchase_channel: form.channel || null,
      purchase_vendor: form.vendor || null,
      purchase_order_id: null,
      total_shipping: Number(form.shipping_cost || 0),
      purchase_currency: 'CNY',
      note: form.notes || null,
      items: form.items.map(item => ({
        film_id: item.film_id ? Number(item.film_id) : null,
        quantity: Number(item.quantity || 0),
        unit_price: item.unit_price === '' ? null : Number(item.unit_price),
        expiry_date: item.expiry_date || null,
        batch_number: item.batch_code || null,
        label: item.label || null,
        note_purchase: null
      }))
    });
  };

  const resetForm = () => {
    setForm({
      order_date: new Date().toISOString().slice(0, 10),
      channel: '',
      vendor: '',
      shipping_cost: '',
      notes: '',
      items: [{ ...EMPTY_ITEM }]
    });
  };

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[90vh]',
        header: 'border-b border-divider',
        footer: 'border-t border-divider'
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <span>Record Purchase Batch</span>
          </div>
          <p className="text-sm font-normal text-default-500">
            Add multiple film rolls from a single purchase
          </p>
        </ModalHeader>

        <ModalBody className="gap-6">
          {/* Order Info Section */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Input
              type="date"
              label="Purchase Date"
              labelPlacement="outside"
              size="sm"
              value={form.order_date}
              onChange={(e) => updateField('order_date', e.target.value)}
              startContent={<Calendar className="w-4 h-4 text-default-400" />}
            />
            <Input
              label="Channel"
              labelPlacement="outside"
              size="sm"
              placeholder="e.g. eBay"
              value={form.channel}
              onChange={(e) => updateField('channel', e.target.value)}
              startContent={<Store className="w-4 h-4 text-default-400" />}
            />
            <Input
              label="Vendor"
              labelPlacement="outside"
              size="sm"
              placeholder="Store name"
              value={form.vendor}
              onChange={(e) => updateField('vendor', e.target.value)}
            />
            <Input
              type="number"
              label="Total Shipping"
              labelPlacement="outside"
              size="sm"
              placeholder="0.00"
              value={form.shipping_cost}
              onChange={(e) => updateField('shipping_cost', e.target.value)}
              startContent={<Truck className="w-4 h-4 text-default-400" />}
            />
          </div>

          <Input
            label="Notes"
            labelPlacement="outside"
            size="sm"
            placeholder="Optional notes about this purchase..."
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            startContent={<FileText className="w-4 h-4 text-default-400" />}
          />

          <Divider />

          {/* Items Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-default-700 flex items-center gap-2">
                <Disc3 className="w-4 h-4" />
                Films in this batch
              </h4>
              <Chip size="sm" variant="flat" color="primary">
                {totalQuantity} rolls total
              </Chip>
            </div>

            <ScrollShadow className="max-h-[300px]">
              <div className="space-y-3">
                {form.items.map((item, index) => (
                  <Card key={index} className="bg-default-50">
                    <CardBody className="p-3">
                      <div className="grid grid-cols-12 gap-3 items-end">
                        {/* Film Select - spans 4 cols */}
                        <div className="col-span-12 sm:col-span-4">
                          <Select
                            size="sm"
                            label="Film"
                            labelPlacement="outside"
                            placeholder="Select film..."
                            selectedKeys={item.film_id ? [item.film_id.toString()] : []}
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] || '';
                              updateItem(index, { film_id: value });
                            }}
                          >
                            {films.map(f => (
                              <SelectItem key={f.id.toString()} textValue={`${f.brand || ''} ${f.name}`}>
                                <div className="flex flex-col">
                                  <span>{f.brand ? `${f.brand} ` : ''}{f.name}</span>
                                  <span className="text-tiny text-default-400">
                                    ISO {f.iso} {f.format && f.format !== '135' ? `• ${f.format}` : ''}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </Select>
                        </div>

                        {/* Quantity */}
                        <div className="col-span-4 sm:col-span-1">
                          <Input
                            type="number"
                            size="sm"
                            label="Qty"
                            labelPlacement="outside"
                            min={1}
                            value={item.quantity.toString()}
                            onChange={(e) => updateItem(index, { quantity: e.target.value })}
                          />
                        </div>

                        {/* Unit Price */}
                        <div className="col-span-4 sm:col-span-2">
                          <Input
                            type="number"
                            size="sm"
                            label="Unit Price"
                            labelPlacement="outside"
                            step="0.01"
                            placeholder="0.00"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, { unit_price: e.target.value })}
                            startContent={<DollarSign className="w-3 h-3 text-default-400" />}
                          />
                        </div>

                        {/* Expiry */}
                        <div className="col-span-4 sm:col-span-2">
                          <Input
                            type="date"
                            size="sm"
                            label="Expiry"
                            labelPlacement="outside"
                            value={item.expiry_date}
                            onChange={(e) => updateItem(index, { expiry_date: e.target.value })}
                          />
                        </div>

                        {/* Batch Code */}
                        <div className="col-span-6 sm:col-span-2">
                          <Input
                            size="sm"
                            label="Batch #"
                            labelPlacement="outside"
                            placeholder="Emulsion"
                            value={item.batch_code}
                            onChange={(e) => updateItem(index, { batch_code: e.target.value })}
                            startContent={<Hash className="w-3 h-3 text-default-400" />}
                          />
                        </div>

                        {/* Delete Button */}
                        <div className="col-span-6 sm:col-span-1 flex justify-end">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="danger"
                            isDisabled={form.items.length <= 1}
                            onPress={() => removeRow(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Label / Notes row */}
                      <div className="mt-2">
                        <Input
                          size="sm"
                          placeholder="Optional label or notes for this item..."
                          value={item.label}
                          onChange={(e) => updateItem(index, { label: e.target.value })}
                          classNames={{
                            input: 'text-xs',
                            inputWrapper: 'h-8'
                          }}
                        />
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </ScrollShadow>

            <Button
              size="sm"
              variant="flat"
              startContent={<Plus className="w-4 h-4" />}
              className="mt-4"
              onPress={addRow}
            >
              Add Another Film
            </Button>
          </div>
        </ModalBody>

        <ModalFooter className="flex justify-between">
          <div className="text-sm text-default-500">
            {totalQuantity > 0 && (
              <span>
                Shipping: ¥{perItemShipping.toFixed(2)}/roll • 
                Total: <span className="font-semibold text-default-700">¥{totalCost.toFixed(2)}</span>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="flat" onPress={handleClose}>
              Cancel
            </Button>
            <Button 
              color="primary" 
              onPress={handleSubmit}
              isLoading={isLoading}
            >
              Save Batch
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
