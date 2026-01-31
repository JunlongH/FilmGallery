/**
 * PurchaseBatchModal - 批量购买胶片模态框
 * 
 * 设计原则：
 * - 每个条目一行显示，紧凑清晰
 * - 胶片选择器带缩略图，视觉清晰
 * - 整体布局均匀宽松
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
  ScrollShadow
} from '@heroui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Film, ShoppingCart, Package } from 'lucide-react';
import { buildUploadUrl } from '../../api';

// 空项模板
const EMPTY_ITEM = {
  film_id: '',
  quantity: 1,
  unit_price: '',
  expiry_date: '',
  batch_code: ''
};

// 获取胶片缩略图
const getFilmThumbUrl = (film) => {
  if (!film) return null;
  const path = film.thumbPath || film.thumbnail_url;
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return buildUploadUrl(path.startsWith('/') ? path : `/uploads/films/${path}`);
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

  // 计算汇总
  const { totalQuantity, totalCost, perItemShipping } = useMemo(() => {
    const qty = form.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const shipping = Number(form.shipping_cost || 0);
    const perItem = qty > 0 ? shipping / qty : 0;
    const itemsCost = form.items.reduce((sum, item) => {
      return sum + (Number(item.quantity || 0) * Number(item.unit_price || 0));
    }, 0);
    return { totalQuantity: qty, totalCost: itemsCost + shipping, perItemShipping: perItem };
  }, [form.items, form.shipping_cost]);

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  
  const updateItem = (index, key, value) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item)
    }));
  };

  const addRow = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));
  
  const removeRow = (index) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
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
        label: null,
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

  const handleClose = () => { resetForm(); onClose?.(); };

  const getSelectedFilm = (filmId) => films.find(f => String(f.id) === String(filmId));

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose}
      size="3xl"
      scrollBehavior="inside"
      backdrop="blur"
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            transition: { duration: 0.25, ease: 'easeOut' }
          },
          exit: {
            y: 10,
            opacity: 0,
            transition: { duration: 0.15, ease: 'easeIn' }
          }
        }
      }}
      classNames={{
        backdrop: "bg-black/60",
        base: "shadow-2xl border border-divider",
        header: "border-b border-divider px-6 py-4",
        body: "p-6",
        footer: "border-t border-divider px-6 py-4"
      }}
    >
      <ModalContent style={{ backgroundColor: 'var(--heroui-content1)' }}>
        {(onModalClose) => (
          <>
            <ModalHeader className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Record Purchase</h3>
                <p className="text-xs text-default-500 font-normal">Add film rolls from a single order</p>
              </div>
            </ModalHeader>

            <ModalBody className="gap-6">
              {/* 订单信息 - 一行四列，使用stacked label避免重叠 */}
              <div>
                <p className="text-sm font-semibold text-default-400 uppercase tracking-wide mb-3">Order Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 120px', gap: '16px' }}>
                  <div>
                    <label className="block text-sm text-default-500 mb-2">Date</label>
                    <Input
                      type="date"
                      size="md"
                      value={form.order_date}
                      onChange={(e) => updateField('order_date', e.target.value)}
                      classNames={{ inputWrapper: "h-10", input: "text-sm" }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-default-500 mb-2">Channel</label>
                    <Input
                      size="md"
                      placeholder="Taobao, eBay..."
                      value={form.channel}
                      onChange={(e) => updateField('channel', e.target.value)}
                      classNames={{ inputWrapper: "h-10", input: "text-sm" }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-default-500 mb-2">Vendor</label>
                    <Input
                      size="md"
                      placeholder="Vendor name"
                      value={form.vendor}
                      onChange={(e) => updateField('vendor', e.target.value)}
                      classNames={{ inputWrapper: "h-10", input: "text-sm" }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-default-500 mb-2">Shipping</label>
                    <Input
                      type="number"
                      size="md"
                      placeholder="0.00"
                      startContent={<span className="text-default-400 text-sm pr-1">¥</span>}
                      value={form.shipping_cost}
                      onChange={(e) => updateField('shipping_cost', e.target.value)}
                      classNames={{ inputWrapper: "h-10", input: "text-sm" }}
                    />
                  </div>
                </div>
              </div>

              <Divider />

              {/* 胶卷列表 - 表格式一行显示 */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-default-400 uppercase tracking-wide flex items-center gap-2">
                    <Film size={16} />
                    Films ({form.items.length})
                  </p>
                  <Button size="sm" variant="flat" color="primary" startContent={<Plus size={14} />} onPress={addRow}>
                    Add Row
                  </Button>
                </div>

                {/* 表头 */}
                <div 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 55px 90px 130px 70px 36px', 
                    gap: '12px',
                    padding: '0 10px',
                    marginBottom: '10px'
                  }}
                  className="text-xs text-default-400 font-medium"
                >
                  <div>Film Type</div>
                  <div style={{ textAlign: 'center' }}>Qty</div>
                  <div>Price</div>
                  <div>Expiry</div>
                  <div>Batch</div>
                  <div></div>
                </div>

                <ScrollShadow className="max-h-[240px]">
                  <div className="space-y-2">
                    <AnimatePresence>
                      {form.items.map((item, index) => {
                        const selectedFilm = getSelectedFilm(item.film_id);
                        const thumbUrl = getFilmThumbUrl(selectedFilm);
                        
                        return (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{ 
                              display: 'grid', 
                              gridTemplateColumns: '1fr 55px 90px 130px 70px 36px', 
                              gap: '12px',
                              alignItems: 'center',
                              padding: '10px',
                              borderRadius: '8px',
                              background: 'rgba(255,255,255,0.03)'
                            }}
                            className="hover:bg-default-100 transition-colors"
                          >
                            {/* 胶片选择器 - 带缩略图 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ 
                                width: '36px', 
                                height: '36px', 
                                borderRadius: '6px', 
                                overflow: 'hidden', 
                                background: '#27272a',
                                flexShrink: 0
                              }}>
                                {thumbUrl ? (
                                  <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Film size={16} className="text-default-400" />
                                  </div>
                                )}
                              </div>
                              <Select
                                size="md"
                                aria-label="Select film"
                                placeholder="Select..."
                                selectedKeys={item.film_id ? [String(item.film_id)] : []}
                                onSelectionChange={(keys) => {
                                  const val = Array.from(keys)[0] || '';
                                  updateItem(index, 'film_id', val);
                                }}
                                classNames={{
                                  trigger: "h-10 min-h-10",
                                  value: "text-sm pr-6",
                                  innerWrapper: "pr-6",
                                  selectorIcon: "right-2",
                                  popoverContent: "bg-content1 border border-default-200 shadow-xl",
                                  listbox: "bg-content1"
                                }}
                                popoverProps={{
                                  classNames: {
                                    content: "bg-zinc-900 border border-zinc-700 shadow-2xl"
                                  }
                                }}
                                style={{ flex: 1, minWidth: 0 }}
                              >
                                {films.map(f => {
                                  const filmThumb = getFilmThumbUrl(f);
                                  return (
                                    <SelectItem 
                                      key={String(f.id)} 
                                      textValue={`${f.brand || ''} ${f.name}`}
                                      className="py-2"
                                    >
                                      <div className="flex items-center gap-3">
                                        <div style={{
                                          width: '28px',
                                          height: '28px',
                                          borderRadius: '4px',
                                          overflow: 'hidden',
                                          background: '#3f3f46',
                                          flexShrink: 0
                                        }}>
                                          {filmThumb ? (
                                            <img src={filmThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                          ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                              <Film size={12} className="text-zinc-500" />
                                            </div>
                                          )}
                                        </div>
                                        <span className="text-sm text-foreground">{f.brand ? `${f.brand} ` : ''}{f.name}</span>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </Select>
                            </div>

                            {/* 数量 */}
                            <div>
                              <Input
                                type="number"
                                size="md"
                                min={1}
                                value={String(item.quantity)}
                                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                classNames={{ input: "text-center text-sm", inputWrapper: "h-10 min-h-10" }}
                              />
                            </div>

                            {/* 单价 */}
                            <div>
                              <Input
                                type="number"
                                size="md"
                                placeholder="0.00"
                                startContent={<span className="text-default-400 text-sm pr-1">¥</span>}
                                value={item.unit_price}
                                onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                                classNames={{ inputWrapper: "h-10 min-h-10", input: "text-sm" }}
                              />
                            </div>

                            {/* 过期日期 */}
                            <div>
                              <Input
                                type="date"
                                size="md"
                                value={item.expiry_date}
                                onChange={(e) => updateItem(index, 'expiry_date', e.target.value)}
                                classNames={{ inputWrapper: "h-10 min-h-10", input: "text-sm" }}
                              />
                            </div>

                            {/* 批次号 */}
                            <div>
                              <Input
                                size="md"
                                placeholder="#"
                                value={item.batch_code}
                                onChange={(e) => updateItem(index, 'batch_code', e.target.value)}
                                classNames={{ inputWrapper: "h-10 min-h-10", input: "text-sm" }}
                              />
                            </div>

                            {/* 删除按钮 */}
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                color="danger"
                                isDisabled={form.items.length <= 1}
                                onPress={() => removeRow(index)}
                                style={{ minWidth: '28px', width: '28px', height: '28px' }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </ScrollShadow>
              </div>
            </ModalBody>

            <ModalFooter>
              <div className="flex-1 flex items-center gap-6 text-sm">
                <span className="flex items-center gap-2 text-default-500">
                  <Package size={16} />
                  <span className="font-medium text-foreground">{totalQuantity}</span> rolls
                </span>
                <span className="text-default-500">
                  ¥{perItemShipping.toFixed(2)}/roll shipping
                </span>
                <span className="font-semibold text-lg text-foreground">
                  Total: ¥{totalCost.toFixed(2)}
                </span>
              </div>
              <Button variant="flat" onPress={onModalClose}>Cancel</Button>
              <Button color="primary" onPress={handleSubmit} isLoading={isLoading}>
                Save Purchase
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
