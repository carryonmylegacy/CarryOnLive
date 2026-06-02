import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from '../ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

/**
 * CategoryFilterSelect — the SDV "Executive Filter".
 *
 * Replaces the old 3-row wall of 17 wrapping pills with one elegant glass
 * trigger bar that opens a premium bottom-sheet (mobile) / anchored popover
 * (desktop) list. Single-select. "All" is pinned first as the reset option;
 * the active type stays visible on the trigger and is highlighted with a
 * gold check in the list.
 *
 * Built for the 40+ audience: 56px (h-14) tap targets, 15px list text, a
 * clearly-labelled trigger, full keyboard/focus support, and no reliance on
 * colour alone for the active state (the trailing Check icon carries it too).
 */

const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Module-scoped so Radix `asChild` can clone a single ref-forwarding child
// without re-creating the component on every parent render.
const TriggerButton = React.forwardRef(({ active, isFiltered, open, ...props }, ref) => {
  const ActiveIcon = active.icon;
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className="w-full flex items-center justify-between h-14 px-4 rounded-xl glass-card text-left transition-all duration-200 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
      data-testid="category-filter-trigger"
    >
      <span className="flex items-center gap-3 min-w-0">
        <ActiveIcon className={`w-5 h-5 shrink-0 ${isFiltered ? 'text-[var(--gold)]' : 'text-[var(--t4)]'}`} />
        <span className="flex flex-col min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t4)] leading-none mb-0.5">
            Filter by type
          </span>
          <span className={`text-base font-semibold truncate leading-tight ${isFiltered ? 'text-[var(--gold)]' : 'text-[var(--t)]'}`}>
            {active.id === 'all' ? 'All documents' : active.label}
          </span>
        </span>
      </span>
      <ChevronDown
        className={`w-5 h-5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''} ${isFiltered ? 'text-[var(--gold)]' : 'text-[var(--t4)]'}`}
      />
    </button>
  );
});
TriggerButton.displayName = 'CategoryFilterTrigger';

const CategoryFilterSelect = ({ categories, activeCategory, onChange }) => {
  const [open, setOpen] = useState(false);
  const active = categories.find((c) => c.id === activeCategory) || categories[0];
  const isFiltered = active.id !== 'all';

  const handleSelect = (id) => {
    onChange(id);
    setOpen(false);
  };

  const List = (
    <div className="py-1" role="listbox" aria-label="Document category" data-testid="category-filter-list">
      {categories.map((cat) => {
        const selected = cat.id === activeCategory;
        const Icon = cat.icon;
        return (
          <button
            key={cat.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => handleSelect(cat.id)}
            className={`w-full flex items-center gap-3 h-14 px-4 text-left transition-colors focus-visible:outline-none focus-visible:bg-[var(--s)] ${
              selected ? 'bg-[rgba(var(--gold-rgb),0.12)]' : 'hover:bg-[var(--s)]'
            } ${cat.id === 'all' ? 'border-b border-[var(--b)]' : 'border-b border-[var(--b)]/40'}`}
            data-testid={`category-item-${kebab(cat.id)}`}
          >
            <Icon className={`w-5 h-5 shrink-0 ${selected ? 'text-[var(--gold)]' : 'text-[var(--t4)]'}`} />
            <span className={`text-[15px] truncate ${selected ? 'font-bold text-[var(--gold)]' : 'text-[var(--t)]'}`}>
              {cat.id === 'all' ? 'All documents' : cat.label}
            </span>
            {selected && <Check className="w-5 h-5 ml-auto shrink-0 text-[var(--gold)]" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile — premium bottom sheet */}
      <div className="md:hidden">
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <TriggerButton active={active} isFiltered={isFiltered} open={open} />
          </DrawerTrigger>
          <DrawerContent
            className="bg-[var(--bg2)] border-t border-[var(--b)] max-h-[80vh]"
            data-testid="category-drawer-content"
          >
            <DrawerTitle className="px-4 pt-3 pb-2 text-lg font-semibold text-[var(--t)]">
              Document category
            </DrawerTitle>
            <div className="overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              {List}
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Desktop — anchored popover, matched to trigger width */}
      <div className="hidden md:block">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <TriggerButton active={active} isFiltered={isFiltered} open={open} />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] p-0 bg-[var(--bg2)] border border-[var(--b)] max-h-[420px] overflow-y-auto"
            data-testid="category-popover-content"
          >
            {List}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
};

export default CategoryFilterSelect;
