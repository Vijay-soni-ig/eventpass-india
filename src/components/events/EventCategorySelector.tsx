import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useOrganizerEventCategories, useOrganizerEventCategory, type PlatformEventCategory } from "@/hooks/platform/usePlatformAdmin";

interface EventCategorySelectorProps {
  value: string;
  onChange: (value: string) => void;
  allowNone?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onTotalChange?: (total: number) => void;
}

export default function EventCategorySelector({
  value,
  onChange,
  allowNone = true,
  disabled = false,
  placeholder = "Select category",
  onTotalChange,
}: EventCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useOrganizerEventCategories(search);
  const { data: selectedCategory } = useOrganizerEventCategory(value || undefined);
  const categories = data?.categories ?? [];

  // Create Event uses this callback to determine whether the platform has any
  // active categories. Do not replace that global count with the current
  // search-result count, otherwise searching for an unmatched term would make
  // a required category appear optional.
  useEffect(() => {
    if (data && !search) onTotalChange?.(data.total);
  }, [data, onTotalChange, search]);

  const selected = selectedCategory ?? categories.find((category) => category.id === value);
  const visibleCategories = categories.filter((category) => category.active || category.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id="event-category"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected?.name ?? (allowNone && !value ? placeholder : "Select category")}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search categories..."
            value={searchInput}
            onValueChange={setSearchInput}
          />
          <CommandList>
            {allowNone ? (
              <CommandItem
                value="none"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check className={`mr-2 h-4 w-4 ${!value ? "opacity-100" : "opacity-0"}`} />
                No category
              </CommandItem>
            ) : null}
            {isLoading || isFetching ? (
              <CommandItem value="loading" disabled>Searching...</CommandItem>
            ) : null}
            {!isLoading && !isFetching && visibleCategories.length === 0 ? (
              <CommandEmpty>No active categories found.</CommandEmpty>
            ) : null}
            {visibleCategories.map((category: PlatformEventCategory) => (
              <CommandItem
                key={category.id}
                value={category.id}
                onSelect={() => {
                  onChange(category.id);
                  setOpen(false);
                }}
              >
                <Check className={`mr-2 h-4 w-4 ${value === category.id ? "opacity-100" : "opacity-0"}`} />
                <span className="truncate">{category.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
