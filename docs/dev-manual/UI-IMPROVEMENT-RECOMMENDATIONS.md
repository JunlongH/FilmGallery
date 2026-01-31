# FilmGallery 桌面端 UI 改进与完善建议

> **创建日期**: 2026-01-30  
> **基于**: DESKTOP-UI-MODERNIZATION-PLAN.md Phase 0-3 完成状态  
> **目标**: 系统性、全面性、可维护性、模块化的UI改进建议

---

## 📊 当前进度总结

### ✅ 已完成 (Phase 0-3)

| 阶段 | 核心成果 | 状态 |
|------|---------|------|
| **Phase 0** | Tailwind v4 + HeroUI 基础设施 | ✅ 完成 |
| **Phase 1** | Timeline + Life Log + Sidebar 现代化 | ✅ 完成 |
| **Phase 2** | Overview + RollDetail 模块化重构 | ✅ 完成 |
| **Phase 3** | Statistics 组件化 (部分) | ✅ 完成 |

**已创建的现代化组件**:
- `components/ui/` - 基础 UI 组件库 (Button, Card, Skeleton, AnimatedContainer, icons)
- `components/Sidebar/` - 模块化侧边栏 (5个子组件)
- `components/Timeline/` - 时间线系统 (7个子组件)
- `components/LifeLog/` - 生活日志 (6个子组件)
- `components/Overview/` - 概览页面 (6个子组件)
- `components/RollDetail/` - 胶卷详情 (5个子组件)
- `components/Statistics/` - 统计组件 (4个子组件)
- `providers/HeroUIProvider.jsx` - 主题系统 + 深色模式

### 🔲 待完成 (Phase 4)

- [ ] 深色模式全局优化
- [ ] 动画系统统一
- [x] ~~FilmLibrary 页面改造~~ ✅ 已完成 (2025-01-30)
  - 创建 GlassModal 可复用玻璃态模态框组件
  - FilmInventoryCard 美化 (渐变状态徽章、胶片缩略图、动画效果)
  - PurchaseBatchModal 玻璃态重构 (毛玻璃背景、缩略图预览)
  - FilmStatusTabs 现代化 (药丸按钮、渐变背景)
- [x] ~~EquipmentManager 页面改造~~ ✅ 已完成 (2025-01-31)
  - 创建 EquipmentEditModal.jsx - HeroUI 风格设备编辑模态框
  - 支持所有 6 种设备类型 (相机、镜头、闪光灯、胶片后背、扫描仪、胶片)
  - 使用 GlassModal, GlassCard, HeroUI Select/Input/Checkbox 组件
  - Select 下拉菜单透明度修复 (遵循 SKILL-FRONTEND-UI-TIPS.md)
- [x] ~~Settings 页面改造~~ ✅ 已完成 (2025-01-31)
  - GeneralSettings.jsx - HeroUI Card, Button, Switch 组件
  - ServerSettings.jsx - HeroUI Card, Button, Input, Chip 组件
  - LutLibrary.jsx - HeroUI Card, Button, Chip 组件
  - SettingsTabs.jsx - 已使用 HeroUI Tabs
- [x] ~~Favorites 页面改造~~ ✅ 已完成 (2025-01-31)
  - HeroUI Card, Button, Chip 组件
  - AnimatedContainer 交错动画
  - 空状态提示 + FavoriteCard 组件
- [x] ~~TagGallery 页面改造~~ ✅ 已完成 (2025-01-31)
  - ThemeCard 标签云展示 + TagPhotoCard 照片卡片
  - AnimatedContainer 交错入场动画
  - HeroUI Button 返回导航
- [ ] 清理冲突的旧 CSS 代码 (部分完成)
  - ⚠️ 仍有组件依赖旧 CSS: RollDetail.jsx, PhotoDetailsSidebar.jsx, ContactSheetModal.jsx
  - 保留文件: sidebar.css, roll-detail-card.css, forms.css, FilmInventory.css (被遗留组件引用)
- [ ] 性能优化与测试

---

## 🎯 改进目标

1. **系统性**: 建立统一的设计语言和组件规范
2. **全面性**: 覆盖所有页面和交互场景
3. **可维护性**: 减少代码重复，提高模块化程度
4. **现代化**: 使用 HeroUI + Tailwind + Framer Motion 提升 UI 体验

---

## 📋 改进清单

### 一、未改造页面的现代化 (Critical)

#### 1.1 FilmLibrary 页面改造 ✅ 已完成

> **完成日期**: 2025-01-30
> **核心改进**: 
> - 创建 `GlassModal` 可复用玻璃态模态框组件 (`components/ui/GlassModal.jsx`)
> - 重构 `FilmInventoryCard` - 渐变状态徽章、胶片缩略图展示、hover动画
> - 重构 `PurchaseBatchModal` - 毛玻璃背景遮罩、胶片选择预览、AnimatePresence动画
> - 重构 `FilmStatusTabs` - 药丸式按钮、渐变选中态、ScrollShadow滚动
> - 使用 Framer Motion 实现流畅的卡片/模态框动画

**原状态**: 
- 使用旧 CSS 样式 (`FilmInventory.css`, `FilmButtons.css`)
- 传统表单 + 按钮布局
- 缺少 HeroUI 组件

**改造方案（已实现）**:

```jsx
// components/FilmLibrary/index.js
export { default as FilmLibraryView } from './FilmLibraryView';
export { default as InventoryTabs } from './InventoryTabs';
export { default as FilmItemCard } from './FilmItemCard';
export { default as BatchAddModal } from './BatchAddModal';
export { default as FilmActionButtons } from './FilmActionButtons';
```

**核心改进点**:

1. **状态过滤 Tabs 化**
   ```jsx
   import { Tabs, Tab, Chip } from '@heroui/react';
   
   <Tabs 
     selectedKey={inventoryStatusFilter} 
     onSelectionChange={setInventoryStatusFilter}
     color="primary"
     variant="underlined"
   >
     <Tab key="all" title={
       <div className="flex items-center gap-2">
         <span>All</span>
         <Chip size="sm" variant="flat">{allCount}</Chip>
       </div>
     } />
     <Tab key="in-stock" title={
       <div className="flex items-center gap-2">
         <Package className="w-4 h-4" />
         <span>In Stock</span>
         <Chip size="sm" color="success">{inStockCount}</Chip>
       </div>
     } />
     <Tab key="loaded" title={
       <div className="flex items-center gap-2">
         <Camera className="w-4 h-4" />
         <span>Loaded</span>
         <Chip size="sm" color="warning">{loadedCount}</Chip>
       </div>
     } />
     <Tab key="used" title={
       <div className="flex items-center gap-2">
         <CheckCircle className="w-4 h-4" />
         <span>Used</span>
         <Chip size="sm" color="default">{usedCount}</Chip>
       </div>
     } />
   </Tabs>
   ```

2. **卡片化库存项**
   ```jsx
   import { Card, CardBody, CardFooter, Button, Dropdown } from '@heroui/react';
   
   function FilmItemCard({ item, onLoad, onUnload, onDevelop, onEdit, onDelete }) {
     const statusColor = {
       'in-stock': 'success',
       'loaded': 'warning',
       'used': 'default'
     }[item.status];
     
     return (
       <Card 
         shadow="sm" 
         isPressable 
         className="transition-all hover:scale-[1.02]"
       >
         <CardBody className="p-4">
           <div className="flex items-start gap-4">
             {/* 胶卷缩略图 */}
             <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-default-100 to-default-200 flex items-center justify-center">
               <Film className="w-8 h-8 text-default-400" />
             </div>
             
             {/* 信息区域 */}
             <div className="flex-1">
               <div className="flex items-center gap-2 mb-1">
                 <h4 className="font-semibold text-lg">{item.film_name}</h4>
                 <Chip size="sm" color={statusColor} variant="flat">
                   {item.status.replace('-', ' ').toUpperCase()}
                 </Chip>
               </div>
               
               <div className="text-sm text-default-500 space-y-1">
                 <div className="flex items-center gap-2">
                   <Box className="w-4 h-4" />
                   <span>{item.format} · {item.iso} ISO · {item.quantity}x</span>
                 </div>
                 {item.expiry_date && (
                   <div className="flex items-center gap-2">
                     <Calendar className="w-4 h-4" />
                     <span>Expires: {new Date(item.expiry_date).toLocaleDateString()}</span>
                   </div>
                 )}
                 {item.loaded_camera && (
                   <div className="flex items-center gap-2">
                     <Camera className="w-4 h-4" />
                     <span>Loaded in: {item.loaded_camera}</span>
                   </div>
                 )}
               </div>
             </div>
           </div>
         </CardBody>
         
         <CardFooter className="border-t border-divider p-3">
           <div className="flex items-center gap-2 w-full">
             {item.status === 'in-stock' && (
               <Button 
                 size="sm" 
                 color="primary" 
                 variant="flat"
                 startContent={<Camera className="w-4 h-4" />}
                 onPress={() => onLoad(item.id)}
               >
                 Load
               </Button>
             )}
             
             {item.status === 'loaded' && (
               <>
                 <Button 
                   size="sm" 
                   color="success" 
                   variant="flat"
                   startContent={<CheckCircle className="w-4 h-4" />}
                   onPress={() => onUnload(item.id)}
                 >
                   Unload
                 </Button>
                 <Button 
                   size="sm" 
                   color="secondary" 
                   variant="flat"
                   startContent={<Droplet className="w-4 h-4" />}
                   onPress={() => onDevelop(item.id)}
                 >
                   Develop
                 </Button>
               </>
             )}
             
             <div className="flex-1" />
             
             <Dropdown>
               <DropdownTrigger>
                 <Button size="sm" isIconOnly variant="light">
                   <MoreVertical className="w-4 h-4" />
                 </Button>
               </DropdownTrigger>
               <DropdownMenu>
                 <DropdownItem 
                   key="edit" 
                   startContent={<Edit className="w-4 h-4" />}
                   onPress={() => onEdit(item)}
                 >
                   Edit
                 </DropdownItem>
                 <DropdownItem 
                   key="delete" 
                   color="danger"
                   startContent={<Trash2 className="w-4 h-4" />}
                   onPress={() => onDelete(item.id)}
                 >
                   Delete
                 </DropdownItem>
               </DropdownMenu>
             </Dropdown>
           </div>
         </CardFooter>
       </Card>
     );
   }
   ```

3. **批量添加 Modal 优化**
   ```jsx
   import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Select } from '@heroui/react';
   
   function BatchAddModal({ isOpen, onClose, onSubmit }) {
     return (
       <Modal 
         isOpen={isOpen} 
         onClose={onClose}
         size="3xl"
         scrollBehavior="inside"
       >
         <ModalContent>
           <ModalHeader>Batch Add Film Items</ModalHeader>
           <ModalBody>
             {/* Form fields with HeroUI Input/Select */}
           </ModalBody>
           <ModalFooter>
             <Button color="danger" variant="light" onPress={onClose}>
               Cancel
             </Button>
             <Button color="primary" onPress={onSubmit}>
               Add Items
             </Button>
           </ModalFooter>
         </ModalContent>
       </Modal>
     );
   }
   ```

**产出文件结构**:
```
components/FilmLibrary/
├── index.js
├── FilmLibraryView.jsx          (主容器)
├── InventoryTabs.jsx             (状态过滤 Tabs)
├── FilmItemCard.jsx              (库存卡片)
├── FilmItemGrid.jsx              (卡片网格)
├── BatchAddModal.jsx             (批量添加弹窗)
├── FilmActionButtons.jsx         (操作按钮组)
└── FilmItemEditModal.jsx         (编辑弹窗 - 可能已存在，需重构)
```

---

#### 1.2 EquipmentManager 页面改造 ✅ 已完成 (2025-01-31)

> **完成日期**: 2025-01-31
> **核心改进**:
> - 创建 `EquipmentEditModal.jsx` - 可复用 HeroUI 风格设备编辑模态框 (900+ 行)
> - 支持所有 6 种设备类型: cameras, lenses, flashes, film-backs, scanners, films
> - 使用 GlassModal + GlassCard 玻璃态设计
> - HeroUI Select/Input/Checkbox/Textarea 表单组件
> - Select 下拉菜单透明度修复 (listbox: "bg-content1" 等)
> - 日期输入深色模式图标修复 (dark:[color-scheme:dark])
> - 常量定义: CAMERA_TYPES, LENS_MOUNTS, FILM_FORMATS 等
> - 更新 EquipmentManager.jsx 使用新模态框替代内联表单
> - 头部按钮更新为 HeroUI Button

**原状态**:
- 1076 行巨型组件
- 使用旧 CSS (`EquipmentManager.css`, `forms.css`)
- 6 种设备类型混杂在一个组件中

**改造方案**:

**核心改进点**:

1. **模块化拆分 (Critical!)**
   ```
   components/EquipmentManager/
   ├── index.js
   ├── EquipmentManagerView.jsx      (主容器，< 100 行)
   ├── EquipmentTabs.jsx              (顶部 Tabs)
   ├── EquipmentGrid.jsx              (通用网格布局)
   ├── EquipmentCard.jsx              (通用设备卡片)
   ├── EquipmentEditModal.jsx         (通用编辑弹窗)
   ├── EquipmentSearchBar.jsx         (搜索栏)
   ├── RelatedRollsDrawer.jsx         (关联胶卷抽屉)
   └── equipment-types/               (按设备类型分离)
       ├── CameraCard.jsx
       ├── LensCard.jsx
       ├── FlashCard.jsx
       ├── FilmBackCard.jsx
       ├── ScannerCard.jsx
       └── FilmCard.jsx
   ```

2. **统一卡片样式**
   ```jsx
   import { Card, CardBody, CardFooter, Image, Button, Chip } from '@heroui/react';
   
   function EquipmentCard({ item, type, onEdit, onDelete, onViewRolls }) {
     return (
       <Card 
         shadow="sm" 
         isPressable
         onPress={() => onViewRolls(item.id)}
         className="transition-all hover:scale-[1.02]"
       >
         <CardBody className="p-0">
           {/* 设备图片 */}
           <Image
             src={item.image_url || '/placeholder-equipment.png'}
             alt={item.name}
             className="w-full aspect-[4/3] object-cover"
             radius="none"
           />
           
           <div className="p-4">
             <h4 className="font-semibold text-lg mb-2">{item.name}</h4>
             
             {/* 类型特定信息 */}
             <div className="space-y-1 text-sm text-default-500">
               {type === 'camera' && (
                 <>
                   <div className="flex items-center gap-2">
                     <Aperture className="w-4 h-4" />
                     <span>{item.format}</span>
                   </div>
                   {item.lens_mount && (
                     <div className="flex items-center gap-2">
                       <Circle className="w-4 h-4" />
                       <span>{item.lens_mount} mount</span>
                     </div>
                   )}
                 </>
               )}
               
               {type === 'lens' && (
                 <>
                   <div className="flex items-center gap-2">
                     <Focus className="w-4 h-4" />
                     <span>{item.focal_length}mm</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <Aperture className="w-4 h-4" />
                     <span>f/{item.max_aperture}</span>
                   </div>
                 </>
               )}
               
               {/* 其他类型... */}
             </div>
             
             {/* 使用统计 */}
             {item.rolls_count > 0 && (
               <div className="mt-3">
                 <Chip size="sm" variant="flat" color="primary">
                   {item.rolls_count} rolls
                 </Chip>
               </div>
             )}
           </div>
         </CardBody>
         
         <CardFooter className="border-t border-divider p-3">
           <div className="flex items-center gap-2 w-full">
             <Button 
               size="sm" 
               variant="light" 
               startContent={<Eye className="w-4 h-4" />}
               onPress={(e) => {
                 e.stopPropagation();
                 onViewRolls(item.id);
               }}
             >
               View Rolls
             </Button>
             
             <div className="flex-1" />
             
             <Button 
               size="sm" 
               isIconOnly 
               variant="light"
               onPress={(e) => {
                 e.stopPropagation();
                 onEdit(item);
               }}
             >
               <Edit2 className="w-4 h-4" />
             </Button>
             
             <Button 
               size="sm" 
               isIconOnly 
               variant="light" 
               color="danger"
               onPress={(e) => {
                 e.stopPropagation();
                 onDelete(item.id);
               }}
             >
               <Trash2 className="w-4 h-4" />
             </Button>
           </div>
         </CardFooter>
       </Card>
     );
   }
   ```

3. **Tabs 现代化**
   ```jsx
   import { Tabs, Tab } from '@heroui/react';
   import { Camera, Aperture, Zap, Box, Scan, Film } from 'lucide-react';
   
   const TABS = [
     { key: 'cameras', label: 'Cameras', icon: Camera },
     { key: 'lenses', label: 'Lenses', icon: Aperture },
     { key: 'flashes', label: 'Flashes', icon: Zap },
     { key: 'film-backs', label: 'Film Backs', icon: Box },
     { key: 'scanners', label: 'Scanners', icon: Scan },
     { key: 'films', label: 'Films', icon: Film }
   ];
   
   function EquipmentTabs({ activeTab, onTabChange }) {
     return (
       <Tabs 
         selectedKey={activeTab}
         onSelectionChange={onTabChange}
         color="primary"
         variant="underlined"
         classNames={{
           tabList: "gap-6",
           cursor: "w-full bg-primary",
           tab: "max-w-fit px-0 h-12",
         }}
       >
         {TABS.map(({ key, label, icon: Icon }) => (
           <Tab 
             key={key}
             title={
               <div className="flex items-center gap-2">
                 <Icon className="w-4 h-4" />
                 <span>{label}</span>
               </div>
             }
           />
         ))}
       </Tabs>
     );
   }
   ```

4. **关联胶卷 Drawer**
   ```jsx
   import { Drawer, DrawerContent, DrawerHeader, DrawerBody } from '@heroui/react';
   
   function RelatedRollsDrawer({ isOpen, onClose, equipment, rolls }) {
     return (
       <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="md">
         <DrawerContent>
           <DrawerHeader>
             <div>
               <h3 className="text-lg font-semibold">{equipment?.name}</h3>
               <p className="text-sm text-default-500">Related Rolls ({rolls.length})</p>
             </div>
           </DrawerHeader>
           <DrawerBody>
             <div className="space-y-3">
               {rolls.map(roll => (
                 <Card key={roll.id} isPressable shadow="sm">
                   <CardBody className="p-4">
                     <div className="flex items-center gap-3">
                       <Image 
                         src={roll.cover_url} 
                         className="w-16 h-16 rounded-lg object-cover"
                       />
                       <div>
                         <h4 className="font-medium">{roll.film_name}</h4>
                         <p className="text-sm text-default-500">
                           {new Date(roll.loaded_date).toLocaleDateString()}
                         </p>
                       </div>
                     </div>
                   </CardBody>
                 </Card>
               ))}
             </div>
           </DrawerBody>
         </DrawerContent>
       </Drawer>
     );
   }
   ```

---

#### 1.3 Settings 页面改造 ✅ 已完成 (2025-01-31)

> **完成日期**: 2025-01-31
> **核心改进**:
> - `SettingsTabs.jsx` - 已使用 HeroUI Tabs (之前已完成)
> - `GeneralSettings.jsx` - 使用 HeroUI Card, Button, Switch 组件
>   - Section 组件重构为 HeroUI Card 包装
>   - Mobile Connection 使用 Card + Chip 显示状态
>   - Data Storage 使用 HeroUI Button
>   - Cloud Sync 使用 HeroUI Switch 替代 checkbox
> - `ServerSettings.jsx` - 使用 HeroUI Card, CardBody, Button, Input, Chip 组件
>   - ModeCard 重构为 HeroUI Card + CardBody
>   - Remote URL 使用 HeroUI Input + Button
>   - Status 区域使用 HeroUI Chip 显示连接状态/能力
>   - 操作按钮使用 HeroUI Button (isLoading, startContent)
> - `LutLibrary.jsx` - 使用 HeroUI Card, CardBody, CardFooter, Button, Chip
>   - Upload 按钮使用 HeroUI Button (isLoading)
>   - LUT 卡片使用 HeroUI Card 组件
>   - 类型标签使用 HeroUI Chip

**原状态**:
- 已有 `Settings/` 模块化目录
- 使用 `SettingsTabs.jsx` 但样式较旧
- 缺少 HeroUI 表单组件

**改造方案**:

1. **Tabs 使用 HeroUI**
   ```jsx
   // Settings/SettingsTabs.jsx
   import { Tabs, Tab } from '@heroui/react';
   import { Settings, Server, Palette, Database } from 'lucide-react';
   
   export default function SettingsTabs({ activeTab, onTabChange }) {
     return (
       <Tabs
         selectedKey={activeTab}
         onSelectionChange={onTabChange}
         color="primary"
         variant="underlined"
         classNames={{
           tabList: "gap-6",
           tab: "max-w-fit px-0 h-12",
         }}
       >
         <Tab 
           key="general"
           title={
             <div className="flex items-center gap-2">
               <Settings className="w-4 h-4" />
               <span>General</span>
             </div>
           }
         />
         <Tab 
           key="server"
           title={
             <div className="flex items-center gap-2">
               <Server className="w-4 h-4" />
               <span>Server</span>
             </div>
           }
         />
         <Tab 
           key="appearance"
           title={
             <div className="flex items-center gap-2">
               <Palette className="w-4 h-4" />
               <span>Appearance</span>
             </div>
           }
         />
         <Tab 
           key="luts"
           title={
             <div className="flex items-center gap-2">
               <Database className="w-4 h-4" />
               <span>LUTs</span>
             </div>
           }
         />
       </Tabs>
     );
   }
   ```

2. **表单组件 HeroUI 化**
   ```jsx
   // Settings/SettingsRow.jsx
   import { Input, Select, SelectItem, Switch } from '@heroui/react';
   
   export function SettingsRow({ label, description, type, value, onChange, options }) {
     return (
       <div className="flex items-center justify-between py-4 border-b border-divider">
         <div className="flex-1">
           <h4 className="font-medium mb-1">{label}</h4>
           {description && (
             <p className="text-sm text-default-500">{description}</p>
           )}
         </div>
         
         <div className="w-64">
           {type === 'text' && (
             <Input 
               value={value}
               onChange={(e) => onChange(e.target.value)}
               variant="bordered"
               size="sm"
             />
           )}
           
           {type === 'select' && (
             <Select
               value={value}
               onChange={(e) => onChange(e.target.value)}
               variant="bordered"
               size="sm"
             >
               {options.map(opt => (
                 <SelectItem key={opt.value} value={opt.value}>
                   {opt.label}
                 </SelectItem>
               ))}
             </Select>
           )}
           
           {type === 'switch' && (
             <Switch
               isSelected={value}
               onValueChange={onChange}
               color="primary"
             />
           )}
         </div>
       </div>
     );
   }
   ```

3. **外观设置 Tab (新增)**
   ```jsx
   // Settings/AppearanceSettings.jsx
   import { Card, CardBody, RadioGroup, Radio } from '@heroui/react';
   import { useTheme } from '../../providers/HeroUIProvider';
   
   export default function AppearanceSettings() {
     const { theme, setTheme } = useTheme();
     
     return (
       <div className="space-y-6">
         <Card>
           <CardBody className="p-6">
             <h3 className="text-lg font-semibold mb-4">Theme</h3>
             <RadioGroup
               value={theme}
               onValueChange={setTheme}
               color="primary"
             >
               <Radio value="light">Light Mode</Radio>
               <Radio value="dark">Dark Mode</Radio>
               <Radio value="auto">Auto (System)</Radio>
             </RadioGroup>
           </CardBody>
         </Card>
         
         <Card>
           <CardBody className="p-6">
             <h3 className="text-lg font-semibold mb-4">Accent Color</h3>
             {/* Color picker for primary color */}
           </CardBody>
         </Card>
         
         <Card>
           <CardBody className="p-6">
             <h3 className="text-lg font-semibold mb-4">Layout</h3>
             <SettingsRow 
               label="Sidebar Width"
               type="select"
               options={[
                 { value: 'sm', label: 'Small' },
                 { value: 'md', label: 'Medium' },
                 { value: 'lg', label: 'Large' }
               ]}
             />
             <SettingsRow 
               label="Compact Mode"
               description="Reduce spacing for more content"
               type="switch"
             />
           </CardBody>
         </Card>
       </div>
     );
   }
   ```

---

#### 1.4 Favorites & TagGallery 改造 ✅ 已完成 (2025-01-31)

> **完成日期**: 2025-01-31
> **核心改进**:
> 
> **Favorites.jsx**:
> - 完整重写为 HeroUI 组件 (Card, CardBody, CardFooter, Button, Chip)
> - AnimatedContainer 交错入场动画 (staggered entry)
> - 空状态提示 (Heart 图标 + "Browse Photos" 按钮)
> - FavoriteCard 组件 (hover overlay, unlike 按钮, roll 导航)
> - 使用 `buildUploadUrl` 构建缩略图 URL
> 
> **TagGallery.jsx**:
> - 完整重写为 HeroUI 组件 (Card, CardBody, CardFooter, Button, Chip)
> - ThemeCard 组件 (标签云展示, 封面图, 照片数量 Chip)
> - TagPhotoCard 组件 (照片卡片, 移除/收藏按钮)
> - AnimatedContainer 交错入场动画
> - 空状态提示 (Tag/Image 图标)
> - HeroUI Button 返回导航 (variant="light", startContent)

**原状态**:
- 基础网格布局
- 缺少 HeroUI 组件
- 无动画效果

**改造方案**:

1. **照片网格使用 HeroUI Card**
   ```jsx
   // components/Favorites/FavoriteGrid.jsx
   import { Card, CardBody, CardFooter, Image, Button } from '@heroui/react';
   import { AnimatedContainer } from '../ui';
   
   export default function FavoriteGrid({ photos, onSelect, onUnlike }) {
     return (
       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
         {photos.map((photo, idx) => (
           <AnimatedContainer key={photo.id} delay={idx * 0.02}>
             <Card 
               isPressable
               shadow="sm"
               onPress={() => onSelect(idx)}
               className="transition-all hover:scale-[1.03]"
             >
               <CardBody className="p-0">
                 <Image
                   src={photo.thumbnail_url}
                   alt={`Photo ${photo.id}`}
                   className="w-full aspect-square object-cover"
                   radius="none"
                 />
               </CardBody>
               
               <CardFooter className="justify-between p-2">
                 <div className="text-xs text-default-500 truncate">
                   {photo.roll_name}
                 </div>
                 <Button
                   size="sm"
                   isIconOnly
                   variant="light"
                   color="danger"
                   onPress={(e) => {
                     e.stopPropagation();
                     onUnlike(photo.id);
                   }}
                 >
                   <Heart className="w-4 h-4 fill-current" />
                 </Button>
               </CardFooter>
             </Card>
           </AnimatedContainer>
         ))}
       </div>
     );
   }
   ```

2. **Tag 标签云使用 Chip**
   ```jsx
   // components/TagGallery/TagCloud.jsx
   import { Chip } from '@heroui/react';
   
   export default function TagCloud({ tags, onSelectTag }) {
     // 根据 photos_count 计算大小
     const maxCount = Math.max(...tags.map(t => t.photos_count));
     
     const getTagSize = (count) => {
       const ratio = count / maxCount;
       if (ratio > 0.7) return 'lg';
       if (ratio > 0.4) return 'md';
       return 'sm';
     };
     
     return (
       <div className="flex flex-wrap gap-3">
         {tags.map(tag => (
           <Chip
             key={tag.id}
             size={getTagSize(tag.photos_count)}
             color="primary"
             variant="flat"
             className="cursor-pointer transition-all hover:scale-110"
             onPress={() => onSelectTag(tag.id)}
           >
             <div className="flex items-center gap-2">
               <Tag className="w-4 h-4" />
               <span>{tag.name}</span>
               <span className="text-xs opacity-70">({tag.photos_count})</span>
             </div>
           </Chip>
         ))}
       </div>
     );
   }
   ```

---

### 二、CSS 清理与整合 (Critical) ⭐⭐⭐⭐⭐

#### 2.1 旧 CSS 文件清理计划

**待清理/整合的 CSS 文件**:
```
client/src/styles/
├── styles.css                    (部分保留，全局样式)
├── variables.css                 (已被 tailwind.css 替代)
├── forms.css                     (可迁移到 Tailwind utilities)
├── sidebar.css                   (已被 Sidebar 组件替代)
├── roll-detail-card.css          (已被 RollDetail 组件替代)
├── map.css                       (保留，地图特定样式)
├── equipment-selector.css        (待迁移)
├── FilmInventory.css             (待迁移)
└── FilmButtons.css               (待迁移)

client/src/components/
├── EquipmentManager.css          (待迁移)
├── ConflictBanner.css            (待迁移)
└── RawImport/RawImportWizard.css (待迁移)
```

**清理策略**:

1. **立即删除** (已被新组件完全替代):
   - `sidebar.css` (已有 Sidebar 组件)
   - `roll-detail-card.css` (已有 RollDetail 组件)

2. **逐步迁移** (改造对应页面后删除):
   - `FilmInventory.css` → FilmLibrary 改造后删除
   - `FilmButtons.css` → FilmLibrary 改造后删除
   - `EquipmentManager.css` → EquipmentManager 改造后删除
   - `equipment-selector.css` → EquipmentSelector 重构后删除

3. **整合到 Tailwind** (通用样式):
   ```css
   /* forms.css 中的样式可以转换为 Tailwind utilities */
   
   /* 旧 CSS */
   .fg-input {
     padding: 8px 12px;
     border: 1px solid var(--fg-border);
     border-radius: 6px;
     font-size: 14px;
   }
   
   /* 迁移方案 1: 直接使用 Tailwind */
   <input className="px-3 py-2 border border-divider rounded-md text-sm" />
   
   /* 迁移方案 2: 使用 HeroUI Input */
   <Input variant="bordered" size="sm" />
   ```

4. **保留必要的** (特殊场景):
   - `map.css` - 地图组件特定样式
   - `styles.css` - 全局基础样式 (简化版)
   - `RawImportWizard.css` - 复杂组件特定样式 (暂时保留)

#### 2.2 CSS 冲突解决

**问题**: 新旧 CSS 可能产生冲突

**解决方案**:

1. **CSS 加载顺序优化**
   ```js
   // index.js - 确保加载顺序
   import './styles.css';          // 全局基础 (最低优先级)
   import './styles/variables.css'; // CSS 变量
   import './styles/tailwind.css';  // Tailwind + HeroUI (最高优先级)
   ```

2. **特异性隔离**
   ```css
   /* 为旧组件添加命名空间 */
   .legacy-film-library {
     /* 旧样式 */
   }
   
   /* 新组件使用 Tailwind/HeroUI，不会冲突 */
   ```

3. **逐步移除**
   ```jsx
   // 组件改造时移除旧 CSS 导入
   
   // 改造前
   import '../styles/FilmInventory.css';
   
   // 改造后
   // (删除 import，使用 HeroUI 组件)
   ```

---

### 三、动画系统增强 ⭐⭐⭐⭐

#### 3.1 统一动画库

**当前状态**:
- 已有 `AnimatedContainer.jsx` 基础封装
- 部分组件使用 Framer Motion

**改进方案**:

1. **扩展动画组件库**
   ```jsx
   // components/ui/animations.js
   import { motion } from 'framer-motion';
   
   // 淡入动画
   export const fadeIn = {
     hidden: { opacity: 0, y: 20 },
     visible: { 
       opacity: 1, 
       y: 0,
       transition: { duration: 0.3, ease: 'easeOut' }
     }
   };
   
   // 缩放动画
   export const scaleIn = {
     hidden: { opacity: 0, scale: 0.95 },
     visible: { 
       opacity: 1, 
       scale: 1,
       transition: { duration: 0.2, ease: 'easeOut' }
     }
   };
   
   // Stagger 容器
   export const staggerContainer = {
     hidden: { opacity: 0 },
     visible: {
       opacity: 1,
       transition: {
         staggerChildren: 0.05,
         delayChildren: 0.1
       }
     }
   };
   
   // 滑入动画
   export const slideIn = (direction = 'left') => ({
     hidden: { 
       opacity: 0, 
       x: direction === 'left' ? -50 : direction === 'right' ? 50 : 0,
       y: direction === 'top' ? -50 : direction === 'bottom' ? 50 : 0
     },
     visible: { 
       opacity: 1, 
       x: 0, 
       y: 0,
       transition: { duration: 0.4, ease: 'easeOut' }
     }
   });
   
   // 悬停效果
   export const hoverScale = {
     rest: { scale: 1 },
     hover: { scale: 1.05, transition: { duration: 0.2 } }
   };
   
   // 点击反馈
   export const tapScale = {
     whileHover: { scale: 1.02 },
     whileTap: { scale: 0.98 }
   };
   ```

2. **高阶动画组件**
   ```jsx
   // components/ui/AnimatedList.jsx
   import { motion } from 'framer-motion';
   import { staggerContainer, fadeIn } from './animations';
   
   export function AnimatedList({ children, className = '' }) {
     return (
       <motion.div
         variants={staggerContainer}
         initial="hidden"
         animate="visible"
         className={className}
       >
         {React.Children.map(children, (child, index) => (
           <motion.div key={index} variants={fadeIn}>
             {child}
           </motion.div>
         ))}
       </motion.div>
     );
   }
   ```

   ```jsx
   // components/ui/AnimatedCard.jsx
   import { motion } from 'framer-motion';
   import { Card as HeroUICard } from '@heroui/react';
   import { hoverScale, tapScale } from './animations';
   
   export function AnimatedCard({ children, hoverable = true, ...props }) {
     const MotionCard = motion(HeroUICard);
     
     return (
       <MotionCard
         {...(hoverable ? tapScale : {})}
         whileHover={hoverable ? hoverScale.hover : undefined}
         {...props}
       >
         {children}
       </MotionCard>
     );
   }
   ```

3. **页面切换动画**
   ```jsx
   // components/ui/PageTransition.jsx
   import { motion, AnimatePresence } from 'framer-motion';
   import { useLocation } from 'react-router-dom';
   
   export function PageTransition({ children }) {
     const location = useLocation();
     
     return (
       <AnimatePresence mode="wait">
         <motion.div
           key={location.pathname}
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           exit={{ opacity: 0, x: -20 }}
           transition={{ duration: 0.2, ease: 'easeInOut' }}
         >
           {children}
         </motion.div>
       </AnimatePresence>
     );
   }
   ```

4. **应用到现有组件**
   ```jsx
   // App.js - 添加页面切换动画
   import { PageTransition } from './components/ui/PageTransition';
   
   function Layout() {
     return (
       <Routes>
         <Route path="/*" element={
           <PageTransition>
             <Routes>
               <Route path="/" element={<CalendarView />} />
               <Route path="/overview" element={<Overview />} />
               {/* ... */}
             </Routes>
           </PageTransition>
         } />
       </Routes>
     );
   }
   ```

#### 3.2 微交互增强

**目标**: 为关键交互添加细腻的反馈动画

1. **按钮点击涟漪效果**
   ```jsx
   // components/ui/RippleButton.jsx
   import { motion } from 'framer-motion';
   import { Button as HeroUIButton } from '@heroui/react';
   import { useState } from 'react';
   
   export function RippleButton({ children, ...props }) {
     const [ripples, setRipples] = useState([]);
     
     const createRipple = (e) => {
       const button = e.currentTarget;
       const rect = button.getBoundingClientRect();
       const size = Math.max(rect.width, rect.height);
       const x = e.clientX - rect.left - size / 2;
       const y = e.clientY - rect.top - size / 2;
       
       const newRipple = { x, y, size, id: Date.now() };
       setRipples([...ripples, newRipple]);
       
       setTimeout(() => {
         setRipples(ripples => ripples.filter(r => r.id !== newRipple.id));
       }, 600);
     };
     
     return (
       <HeroUIButton
         {...props}
         onPress={(e) => {
           createRipple(e);
           props.onPress?.(e);
         }}
         className={`relative overflow-hidden ${props.className}`}
       >
         {children}
         {ripples.map(ripple => (
           <motion.span
             key={ripple.id}
             className="absolute bg-white opacity-30 rounded-full"
             style={{
               left: ripple.x,
               top: ripple.y,
               width: ripple.size,
               height: ripple.size,
             }}
             initial={{ scale: 0, opacity: 0.5 }}
             animate={{ scale: 2, opacity: 0 }}
             transition={{ duration: 0.6, ease: 'easeOut' }}
           />
         ))}
       </HeroUIButton>
     );
   }
   ```

2. **加载状态动画**
   ```jsx
   // components/ui/LoadingSpinner.jsx
   import { motion } from 'framer-motion';
   
   export function LoadingSpinner({ size = 'md' }) {
     const sizeMap = { sm: 16, md: 24, lg: 32 };
     const spinnerSize = sizeMap[size];
     
     return (
       <motion.div
         className="inline-block"
         animate={{ rotate: 360 }}
         transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
       >
         <svg
           width={spinnerSize}
           height={spinnerSize}
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           strokeWidth="2"
         >
           <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
           <path
             d="M12 2a10 10 0 0 1 10 10"
             strokeLinecap="round"
           />
         </svg>
       </motion.div>
     );
   }
   ```

3. **Toast 通知动画**
   ```jsx
   // components/ui/Toast.jsx
   import { motion, AnimatePresence } from 'framer-motion';
   import { Card, CardBody } from '@heroui/react';
   import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
   
   export function Toast({ type = 'info', message, isOpen, onClose }) {
     const icons = {
       success: <CheckCircle className="w-5 h-5 text-success" />,
       error: <AlertCircle className="w-5 h-5 text-danger" />,
       info: <Info className="w-5 h-5 text-primary" />
     };
     
     return (
       <AnimatePresence>
         {isOpen && (
           <motion.div
             initial={{ opacity: 0, y: -50, scale: 0.95 }}
             animate={{ opacity: 1, y: 0, scale: 1 }}
             exit={{ opacity: 0, y: -20, scale: 0.95 }}
             transition={{ duration: 0.2 }}
             className="fixed top-4 right-4 z-50"
           >
             <Card shadow="lg" className="min-w-[300px]">
               <CardBody className="flex flex-row items-center gap-3 p-4">
                 {icons[type]}
                 <p className="flex-1">{message}</p>
                 <button
                   onClick={onClose}
                   className="text-default-400 hover:text-foreground transition-colors"
                 >
                   <X className="w-4 h-4" />
                 </button>
               </CardBody>
             </Card>
           </motion.div>
         )}
       </AnimatePresence>
     );
   }
   ```

---

### 四、深色模式全局优化 ⭐⭐⭐⭐

#### 4.1 深色模式兼容性检查

**已完成**:
- ✅ 主题系统 (HeroUIProvider + ThemeContext)
- ✅ 深色模式切换 (ThemeToggle)
- ✅ CSS 变量映射 (tailwind.css)

**待完成**:

1. **Recharts 图表深色模式适配**
   ```jsx
   // components/Statistics/ChartWrapper.jsx
   import { useTheme } from '../../providers/HeroUIProvider';
   
   export function ChartWrapper({ children }) {
     const { theme } = useTheme();
     const isDark = theme === 'dark';
     
     // 深色模式颜色配置
     const chartColors = {
       text: isDark ? '#e4e4e7' : '#18181b',
       grid: isDark ? '#3f3f46' : '#e4e4e7',
       tooltip: {
         background: isDark ? '#18181b' : '#ffffff',
         border: isDark ? '#3f3f46' : '#e4e4e7'
       }
     };
     
     return React.cloneElement(children, {
       style: { color: chartColors.text },
       // 传递深色模式配置给 Recharts
     });
   }
   ```

2. **图片在深色模式下的优化**
   ```jsx
   // components/ui/DarkModeImage.jsx
   import { Image as HeroUIImage } from '@heroui/react';
   import { useTheme } from '../../providers/HeroUIProvider';
   
   export function DarkModeImage({ src, alt, ...props }) {
     const { theme } = useTheme();
     const isDark = theme === 'dark';
     
     return (
       <HeroUIImage
         src={src}
         alt={alt}
         className={`${isDark ? 'brightness-90' : ''} ${props.className}`}
         {...props}
       />
     );
   }
   ```

3. **地图组件深色模式**
   ```jsx
   // pages/MapPage.jsx
   import { useTheme } from '../providers/HeroUIProvider';
   
   function MapPage() {
     const { theme } = useTheme();
     
     const mapStyle = theme === 'dark' 
       ? 'mapbox://styles/mapbox/dark-v10'
       : 'mapbox://styles/mapbox/light-v10';
     
     return (
       <Map style={mapStyle} />
     );
   }
   ```

#### 4.2 深色模式配色优化

**问题**: 当前深色模式可能颜色对比度不足

**优化方案**:

```css
/* styles/tailwind.css - 深色模式专用调色板 */
@theme {
  /* Light Mode (保持不变) */
  --color-primary-500: #6366f1;
  
  /* Dark Mode - 增加对比度 */
  @media (prefers-color-scheme: dark) {
    --color-primary-500: #818cf8;  /* 更亮的紫色 */
    --color-bg: #09090b;           /* 更深的背景 */
    --color-bg-alt: #18181b;       /* 卡片背景 */
    --color-text: #fafafa;         /* 更亮的文本 */
    --color-border: #27272a;       /* 更明显的边框 */
  }
}
```

---

### 五、性能优化 ⭐⭐⭐⭐

#### 5.1 代码分割与懒加载

**当前状态**: 部分组件已使用 `React.lazy`

**改进方案**:

```jsx
// App.js - 优化路由懒加载
import { lazy, Suspense } from 'react';
import { Spinner } from '@heroui/react';

// 核心页面 - 立即加载
import CalendarView from './components/CalendarView';
import Overview from './components/Overview';

// 次要页面 - 懒加载
const RollDetail = lazy(() => import('./components/RollDetail'));
const FilmLibrary = lazy(() => import('./components/FilmLibrary'));
const EquipmentManager = lazy(() => import('./components/EquipmentManager'));
const Settings = lazy(() => import('./components/Settings'));
const Statistics = lazy(() => import('./components/Statistics'));
const MapPage = lazy(() => import('./pages/MapPage'));
const FilmLab = lazy(() => import('./components/FilmLab/FilmLab'));

// 加载占位符
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Spinner size="lg" label="Loading..." />
    </div>
  );
}

function Layout() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<CalendarView />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/rolls/:id" element={<RollDetail />} />
        <Route path="/films" element={<FilmLibrary />} />
        <Route path="/equipment" element={<EquipmentManager />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/stats" element={<Statistics />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/filmlab" element={<FilmLab />} />
      </Routes>
    </Suspense>
  );
}
```

#### 5.2 图片优化

**改进方案**:

```jsx
// components/ui/OptimizedImage.jsx
import { Image as HeroUIImage } from '@heroui/react';
import { useState } from 'react';

export function OptimizedImage({ 
  src, 
  alt, 
  thumbnailSrc, 
  aspectRatio = '3/2',
  ...props 
}) {
  const [loaded, setLoaded] = useState(false);
  
  return (
    <div style={{ aspectRatio }} className="relative overflow-hidden">
      {/* 缩略图 (低质量，快速加载) */}
      {thumbnailSrc && !loaded && (
        <HeroUIImage
          src={thumbnailSrc}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover blur-sm"
        />
      )}
      
      {/* 高质量图片 */}
      <HeroUIImage
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        {...props}
      />
    </div>
  );
}
```

#### 5.3 虚拟滚动优化

**现有组件**: `VirtualPhotoGrid.jsx` (使用 react-window)

**改进方案**: 确保所有大列表使用虚拟滚动

```jsx
// components/ui/VirtualGrid.jsx
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

export function VirtualGrid({ 
  items, 
  columnCount = 4, 
  rowHeight = 200,
  gap = 16,
  renderItem 
}) {
  const columnWidth = (width) => (width - gap * (columnCount - 1)) / columnCount;
  
  return (
    <AutoSizer>
      {({ height, width }) => (
        <Grid
          columnCount={columnCount}
          columnWidth={columnWidth(width)}
          height={height}
          rowCount={Math.ceil(items.length / columnCount)}
          rowHeight={rowHeight}
          width={width}
        >
          {({ columnIndex, rowIndex, style }) => {
            const index = rowIndex * columnCount + columnIndex;
            if (index >= items.length) return null;
            
            return (
              <div style={{ ...style, padding: gap / 2 }}>
                {renderItem(items[index], index)}
              </div>
            );
          }}
        </Grid>
      )}
    </AutoSizer>
  );
}
```

---

### 六、组件库扩展 ⭐⭐⭐

#### 6.1 缺失的 UI 组件

**需要添加的组件**:

1. **Breadcrumbs** (面包屑导航)
   ```jsx
   // components/ui/Breadcrumbs.jsx
   import { Breadcrumbs as HeroUIBreadcrumbs, BreadcrumbItem } from '@heroui/react';
   import { useLocation, Link } from 'react-router-dom';
   import { Home, ChevronRight } from 'lucide-react';
   
   export function Breadcrumbs() {
     const location = useLocation();
     const pathnames = location.pathname.split('/').filter(x => x);
     
     return (
       <HeroUIBreadcrumbs
         separator={<ChevronRight className="w-4 h-4" />}
         className="mb-4"
       >
         <BreadcrumbItem>
           <Link to="/" className="flex items-center gap-1">
             <Home className="w-4 h-4" />
             <span>Home</span>
           </Link>
         </BreadcrumbItem>
         
         {pathnames.map((value, index) => {
           const to = `/${pathnames.slice(0, index + 1).join('/')}`;
           const isLast = index === pathnames.length - 1;
           
           return (
             <BreadcrumbItem key={to} isCurrent={isLast}>
               {isLast ? (
                 <span className="capitalize">{value}</span>
               ) : (
                 <Link to={to} className="capitalize">
                   {value}
                 </Link>
               )}
             </BreadcrumbItem>
           );
         })}
       </HeroUIBreadcrumbs>
     );
   }
   ```

2. **Empty State** (空状态占位)
   ```jsx
   // components/ui/EmptyState.jsx
   import { Card, CardBody, Button } from '@heroui/react';
   import { motion } from 'framer-motion';
   
   export function EmptyState({ 
     icon: Icon, 
     title, 
     description, 
     action,
     actionLabel = 'Get Started'
   }) {
     return (
       <motion.div
         initial={{ opacity: 0, scale: 0.95 }}
         animate={{ opacity: 1, scale: 1 }}
         transition={{ duration: 0.3 }}
       >
         <Card className="max-w-md mx-auto">
           <CardBody className="text-center p-12">
             {Icon && (
               <div className="flex justify-center mb-4">
                 <div className="p-4 rounded-full bg-default-100">
                   <Icon className="w-12 h-12 text-default-400" />
                 </div>
               </div>
             )}
             
             <h3 className="text-xl font-semibold mb-2">{title}</h3>
             <p className="text-default-500 mb-6">{description}</p>
             
             {action && (
               <Button color="primary" onPress={action}>
                 {actionLabel}
               </Button>
             )}
           </CardBody>
         </Card>
       </motion.div>
     );
   }
   ```

3. **Pagination** (分页器)
   ```jsx
   // components/ui/Pagination.jsx
   import { Pagination as HeroUIPagination } from '@heroui/react';
   
   export function Pagination({ 
     total, 
     page, 
     pageSize = 20, 
     onPageChange 
   }) {
     const totalPages = Math.ceil(total / pageSize);
     
     return (
       <div className="flex justify-center items-center gap-4 mt-6">
         <span className="text-sm text-default-500">
           Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}
         </span>
         
         <HeroUIPagination
           total={totalPages}
           page={page}
           onChange={onPageChange}
           color="primary"
           showControls
         />
       </div>
     );
   }
   ```

4. **ContextMenu** (右键菜单)
   ```jsx
   // components/ui/ContextMenu.jsx
   import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
   import { useState } from 'react';
   
   export function ContextMenu({ items, children }) {
     const [position, setPosition] = useState({ x: 0, y: 0 });
     const [isOpen, setIsOpen] = useState(false);
     
     const handleContextMenu = (e) => {
       e.preventDefault();
       setPosition({ x: e.clientX, y: e.clientY });
       setIsOpen(true);
     };
     
     return (
       <>
         <div onContextMenu={handleContextMenu}>
           {children}
         </div>
         
         {isOpen && (
           <div
             style={{ position: 'fixed', left: position.x, top: position.y }}
             onMouseLeave={() => setIsOpen(false)}
           >
             <DropdownMenu>
               {items.map((item, index) => (
                 <DropdownItem
                   key={index}
                   startContent={item.icon}
                   onPress={() => {
                     item.onPress();
                     setIsOpen(false);
                   }}
                 >
                   {item.label}
                 </DropdownItem>
               ))}
             </DropdownMenu>
           </div>
         )}
       </>
     );
   }
   ```

#### 6.2 更新组件库导出

```js
// components/ui/index.js
export * from './Button';
export * from './Card';
export * from './Skeleton';
export * from './AnimatedContainer';
export * from './icons';

// 新增导出
export * from './animations';
export * from './AnimatedList';
export * from './AnimatedCard';
export * from './PageTransition';
export * from './RippleButton';
export * from './LoadingSpinner';
export * from './Toast';
export * from './Breadcrumbs';
export * from './EmptyState';
export * from './Pagination';
export * from './ContextMenu';
export * from './OptimizedImage';
export * from './VirtualGrid';
```

---

### 七、渐进增强功能 ⭐⭐⭐

#### 7.1 快捷键系统

```jsx
// hooks/useKeyboardShortcuts.js
import { useEffect } from 'react';

export function useKeyboardShortcuts(shortcuts) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      
      const combo = `${ctrl ? 'ctrl+' : ''}${shift ? 'shift+' : ''}${alt ? 'alt+' : ''}${key}`;
      
      const shortcut = shortcuts[combo];
      if (shortcut) {
        e.preventDefault();
        shortcut();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

// 使用示例
function RollDetail() {
  useKeyboardShortcuts({
    'ctrl+s': () => console.log('Save'),
    'ctrl+f': () => console.log('Search'),
    'escape': () => console.log('Close'),
    'ctrl+shift+d': () => console.log('Duplicate')
  });
}
```

#### 7.2 拖拽排序

```jsx
// components/ui/SortableList.jsx
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function SortableList({ items, onReorder, renderItem }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over.id) {
      const oldIndex = items.findIndex(item => item.id === active.id);
      const newIndex = items.findIndex(item => item.id === over.id);
      
      const newItems = arrayMove(items, oldIndex, newIndex);
      onReorder(newItems);
    }
  };
  
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {items.map(item => (
          <SortableItem key={item.id} id={item.id}>
            {renderItem(item)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

#### 7.3 搜索高亮

```jsx
// components/ui/HighlightText.jsx
export function HighlightText({ text, query }) {
  if (!query) return <span>{text}</span>;
  
  const regex = new RegExp(`(${query})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <span>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="bg-warning-100 text-warning-900 dark:bg-warning-900 dark:text-warning-100">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
}
```

---

## 📅 实施时间表

### Phase 4 详细计划 (2 weeks)

#### Week 1: 页面改造 + CSS 清理

**Day 1-2: FilmLibrary 改造**
- [ ] 创建 `components/FilmLibrary/` 模块
- [ ] 实现 InventoryTabs, FilmItemCard, BatchAddModal
- [ ] 删除 `FilmInventory.css`, `FilmButtons.css`

**Day 3-4: EquipmentManager 模块化**
- [ ] 拆分为 10+ 子组件
- [ ] 实现 EquipmentCard, EquipmentEditModal
- [ ] 删除 `EquipmentManager.css`

**Day 5: Settings 改造**
- [ ] 升级 SettingsTabs 为 HeroUI Tabs
- [ ] 新增 AppearanceSettings 页面
- [ ] 表单组件 HeroUI 化

**Day 6-7: Favorites & TagGallery 改造**
- [ ] 实现 FavoriteGrid, TagCloud
- [ ] 添加动画效果

#### Week 2: 优化 + 扩展

**Day 8-9: 动画系统**
- [ ] 创建 `animations.js`, `AnimatedList.jsx`, `AnimatedCard.jsx`
- [ ] 添加 PageTransition 到路由
- [ ] 实现微交互 (RippleButton, LoadingSpinner, Toast)

**Day 10: 深色模式优化**
- [ ] Recharts 深色适配
- [ ] 图片/地图深色优化
- [ ] 测试所有页面深色模式

**Day 11-12: 组件库扩展**
- [ ] Breadcrumbs, EmptyState, Pagination, ContextMenu
- [ ] 更新 `components/ui/index.js`

**Day 13-14: 性能优化 + 测试**
- [ ] 路由懒加载优化
- [ ] 图片优化 (OptimizedImage)
- [ ] 全功能回归测试
- [ ] 性能基准测试
- [ ] Bug 修复

---

## 🎯 验收标准

### 功能完整性
- [ ] 所有页面使用 HeroUI 组件
- [ ] 旧 CSS 文件清理完毕 (仅保留 styles.css, map.css)
- [ ] 深色模式全局正常
- [ ] 所有交互有动画反馈

### 代码质量
- [ ] 组件模块化，单个文件 < 300 行
- [ ] 使用 TypeScript (可选)
- [ ] ESLint 无错误
- [ ] 注释覆盖率 > 30%

### 性能指标
- [ ] 首次加载 < 3 秒
- [ ] 页面切换 < 500ms
- [ ] 照片网格滚动 > 30fps
- [ ] 打包体积增长 < 300KB

### 用户体验
- [ ] 所有按钮有点击反馈
- [ ] 加载状态有 Spinner
- [ ] 错误状态有友好提示
- [ ] 空状态有 EmptyState 组件

---

## 📚 参考资源

- [HeroUI 官方文档](https://heroui.com/docs)
- [Tailwind CSS v4 文档](https://tailwindcss.com/docs)
- [Framer Motion 文档](https://www.framer.com/motion/)
- [Lucide React Icons](https://lucide.dev/)
- [React 性能优化指南](https://react.dev/learn/render-and-commit)

---

## 🔄 持续维护

### 定期检查项
- [ ] 每月检查 HeroUI/Tailwind 更新
- [ ] 每季度进行性能审计
- [ ] 收集用户反馈，优先修复 UI 问题

### 未来展望
- [ ] 考虑引入 Storybook 组件文档
- [ ] 添加单元测试 (Jest + React Testing Library)
- [ ] 探索 CSS-in-JS 方案 (如需更细粒度控制)

---

**文档维护**: 请在完成每个改进项后，更新此文档的 checkbox，并在 DESKTOP-UI-MODERNIZATION-PLAN.md 中同步更新状态。
