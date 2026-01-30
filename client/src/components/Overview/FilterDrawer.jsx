/**
 * FilterDrawer - Advanced filters sidebar
 * 
 * Features:
 * - Camera/Lens/Photographer filters
 * - Year/Month selection
 * - Location filter
 * - Film type filter
 * - Clear all functionality
 */
import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter,
  Button, 
  Chip,
  Divider,
  ScrollShadow,
  Accordion,
  AccordionItem
} from '@heroui/react';
import { 
  X, 
  RotateCcw, 
  Camera, 
  Aperture, 
  User, 
  Film, 
  MapPin, 
  Calendar,
  Check
} from 'lucide-react';
import { getMetadataOptions, getLocations, getFilms } from '../../api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function FilterDrawer({ isOpen, onClose, filters, onChange }) {
  const [options, setOptions] = useState({ 
    cameras: [], 
    lenses: [], 
    photographers: [], 
    years: [], 
    films: [] 
  });
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    getMetadataOptions()
      .then(o => setOptions(prev => ({ ...prev, ...o })))
      .catch(console.error);
    getLocations()
      .then(setLocations)
      .catch(console.error);
    getFilms()
      .then(arr => setOptions(prev => ({ ...prev, films: Array.isArray(arr) ? arr : [] })))
      .catch(console.error);
  }, []);

  const toggleValue = (key, value) => {
    const current = Array.isArray(filters[key]) ? filters[key] : [];
    const exists = current.includes(value);
    const next = exists ? current.filter(v => v !== value) : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  const toggleYear = (year) => {
    const currentYears = Array.isArray(filters.year) ? filters.year : [];
    const isOn = currentYears.includes(year);
    const nextYears = isOn ? currentYears.filter(y => y !== year) : [...currentYears, year];
    // If turning off, also remove month filters for this year
    const nextYm = (filters.ym || []).filter(v => !String(v).startsWith(`${year}-`));
    onChange({ ...filters, year: nextYears, ym: nextYm });
  };

  const toggleYearMonth = (year, monthIdx) => {
    const ym = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
    const current = filters.ym || [];
    const exists = current.includes(ym);
    const next = exists ? current.filter(v => v !== ym) : [...current, ym];
    // Ensure year is selected
    const years = filters.year?.includes(year) ? filters.year : [...(filters.year || []), year];
    onChange({ ...filters, ym: next, year: years });
  };

  const clearFilters = () => {
    onChange({
      camera: [],
      lens: [],
      photographer: [],
      location_id: [],
      year: [],
      ym: [],
      film: []
    });
  };

  const activeCount = Object.values(filters).reduce((acc, val) => 
    acc + (Array.isArray(val) ? val.length : 0), 0
  );

  const normalizeItems = (items) => 
    items.map(it => typeof it === 'object' ? it : { value: String(it), label: String(it) });

  const FilterSection = ({ title, icon: Icon, items = [], keyName, color = "primary" }) => {
    const selected = filters[keyName] || [];
    const normItems = normalizeItems(items);
    
    return (
      <div className="mb-2">
        <Accordion isCompact variant="light" defaultExpandedKeys={["1"]}>
          <AccordionItem 
            key="1" 
            aria-label={title} 
            title={
              <div className="flex items-center gap-2 text-default-600 font-medium">
                {Icon && <Icon size={18} />}
                <span>{title}</span>
                {selected.length > 0 && (
                  <Chip size="sm" variant="flat" color={color} className="h-5 min-w-5 px-0 ml-auto mr-2">
                    {selected.length}
                  </Chip>
                )}
              </div>
            }
            classNames={{
              trigger: "px-0 py-2 data-[hover=true]:bg-transparent",
              content: "pb-4"
            }}
          >
            <div className="flex flex-wrap gap-2 pt-1">
              {normItems.map((item, idx) => {
                const isActive = selected.includes(item.value);
                return (
                  <Chip
                    key={idx}
                    variant={isActive ? 'flat' : 'bordered'}
                    color={isActive ? color : 'default'}
                    className={`cursor-pointer transition-all hover:scale-105 border-small ${
                      isActive ? 'pr-1' : ''
                    }`}
                    onClick={() => toggleValue(keyName, item.value)}
                    startContent={isActive ? <Check size={12} className="ml-1" /> : null}
                  >
                    {item.label}
                  </Chip>
                );
              })}
              {items.length === 0 && (
                <span className="text-default-400 text-sm italic">No options available</span>
              )}
            </div>
          </AccordionItem>
        </Accordion>
      </div>
    );
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size="full"
      className="m-0 sm:m-0 h-[100dvh] max-h-[100dvh] w-full sm:w-[400px] rounded-none sm:rounded-none fixed right-0 inset-y-0"
      motionProps={{
        variants: {
          enter: { x: 0, opacity: 1, transition: { duration: 0.3, ease: "easeOut" } },
          exit: { x: "100%", opacity: 0.5, transition: { duration: 0.2, ease: "easeIn" } },
        }
      }}
      classNames={{
        wrapper: "justify-end !items-start overflow-hidden",
        base: "h-full max-h-screen rounded-none shadow-2xl bg-content1/95 backdrop-blur-xl border-l border-divider",
        header: "border-b border-divider/50 p-4 h-[60px] flex items-center bg-transparent",
        body: "p-0 bg-transparent",
        footer: "border-t border-divider/50 p-4 bg-transparent",
        backdrop: "bg-black/20 backdrop-blur-[2px]"
      }}
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="gap-2">
          <Button isIconOnly variant="light" onPress={onClose} size="sm">
             <X size={20} />
          </Button>
          <div className="flex flex-col">
            <span className="text-lg font-bold leading-tight">Filters</span>
            <span className="text-xs text-default-500 font-normal">Active filters: {activeCount}</span>
          </div>
          {activeCount > 0 && (
            <Button
              size="sm"
              variant="flat"
              color="danger"
              startContent={<RotateCcw size={14} />}
              onPress={clearFilters}
              className="ml-auto"
            >
              Reset
            </Button>
          )}
        </ModalHeader>
        
        <ModalBody>
          <ScrollShadow className="h-full p-4 space-y-2">
            
            {/* Camera */}
            <FilterSection 
              title="Camera" 
              icon={Camera}
              items={options.cameras} 
              keyName="camera" 
              color="success"
            />
            
            <Divider className="my-1 opacity-50" />
            
            {/* Lens */}
            <FilterSection 
              title="Lens" 
              icon={Aperture}
              items={options.lenses} 
              keyName="lens" 
              color="warning"
            />
            
            <Divider className="my-1 opacity-50" />
            
            {/* Film */}
            <FilterSection 
              title="Film Stock" 
              icon={Film}
              items={options.films.map(f => ({ value: f.id || f.name, label: f.name }))} 
              keyName="film"
              color="secondary" 
            />
            
            <Divider className="my-1 opacity-50" />

            {/* Photographer */}
            <FilterSection 
              title="Photographer" 
              icon={User}
              items={options.photographers} 
              keyName="photographer" 
              color="primary"
            />
            
            <Divider className="my-1 opacity-50" />
            
            {/* Location */}
             <div className="mb-2">
              <Accordion isCompact variant="light" defaultExpandedKeys={["1"]}>
                 <AccordionItem 
                    key="1" 
                    title={
                      <div className="flex items-center gap-2 text-default-600 font-medium">
                        <MapPin size={18} />
                        <span>Location</span>
                      </div>
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      {locations.map((loc, idx) => {
                        const isActive = (filters.location_id || []).includes(loc.id);
                        return (
                          <Chip
                            key={idx}
                            variant={isActive ? 'flat' : 'bordered'}
                            color={isActive ? 'danger' : 'default'}
                            className="cursor-pointer transition-all hover:scale-105"
                            onClick={() => toggleValue('location_id', loc.id)}
                            startContent={isActive ? <Check size={12} className="ml-1" /> : null}
                          >
                            {loc.name || loc.city_name || `Location ${loc.id}`}
                          </Chip>
                        );
                      })}
                      {locations.length === 0 && <span className="text-default-400 text-sm">No locations</span>}
                    </div>
                 </AccordionItem>
              </Accordion>
            </div>

            <Divider className="my-1 opacity-50" />

            {/* Year/Month */}
            <div className="mb-4">
              <Accordion isCompact variant="light" defaultExpandedKeys={["1"]}>
                <AccordionItem
                  key="1"
                  title={
                    <div className="flex items-center gap-2 text-default-600 font-medium">
                      <Calendar size={18} />
                      <span>Date</span>
                    </div>
                  }
                >
                  <div className="flex flex-col gap-3">
                    {options.years?.map(year => {
                      const isYearActive = (filters.year || []).includes(year);
                      
                      return (
                        <div key={year} className="bg-content2/50 rounded-lg p-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-small">{year}</span>
                            <Chip 
                              size="sm" 
                              variant={isYearActive ? "solid" : "light"}
                              color="primary"
                              classNames={{ content: "font-bold" }}
                              onClick={() => toggleYear(year)}
                              className="cursor-pointer"
                            >
                              All Year
                            </Chip>
                          </div>
                          
                          {/* Months Grid */}
                          <div className="grid grid-cols-4 gap-1">
                            {MONTHS.map((mName, mIdx) => {
                              const ym = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
                              const isMonthActive = (filters.ym || []).includes(ym);
                              
                              return (
                                <div 
                                  key={mName}
                                  onClick={() => toggleYearMonth(year, mIdx)}
                                  className={`
                                    text-center text-xs py-1.5 rounded-md cursor-pointer transition-colors
                                    ${isMonthActive 
                                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
                                      : 'hover:bg-default-200 text-default-500'}
                                  `}
                                >
                                  {mName}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionItem>
              </Accordion>
            </div>

          </ScrollShadow>
        </ModalBody>

        <ModalFooter className="flex-col gap-2">
          <Button 
            fullWidth 
            color="primary" 
            size="lg"
            className="font-bold shadow-lg shadow-primary/20"
            onPress={onClose}
          >
            Show Results
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
