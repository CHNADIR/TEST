import React, { useState, useEffect } from 'react';
import { Button } from './button'; // Assuming shadcn/ui button
import { Popover, PopoverContent, PopoverTrigger } from './popover'; // Assuming shadcn/ui popover
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command'; // Assuming shadcn/ui command
import { X } from 'lucide-react';

export type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectChipInputProps = {
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

const MultiSelectChipInput: React.FC<MultiSelectChipInputProps> = ({
  options,
  selectedValues,
  onChange,
  placeholder = "Select...",
  className,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleSelect = (value: string) => {
    if (!selectedValues.includes(value)) {
      onChange([...selectedValues, value]);
    }
    setInputValue('');
    // Optionally close popover on select, or allow multiple selections before closing
    // setIsOpen(false); 
  };

  const handleDeselect = (value: string) => {
    onChange(selectedValues.filter((v) => v !== value));
  };

  const selectedOptions = options.filter(opt => selectedValues.includes(opt.value));

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-2 p-2 border border-input rounded-md min-h-[40px]">
        {selectedOptions.map((option) => (
          <span
            key={option.value}
            className="flex items-center px-2 py-1 text-sm bg-secondary text-secondary-foreground rounded-md"
          >
            {option.label}
            {!disabled && (
              <Button
                variant="ghost"
                size="icon" // Custom size or use icon button
                className="ml-1 h-4 w-4 p-0"
                onClick={() => handleDeselect(option.value)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </span>
        ))}
        {!disabled && (
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={isOpen} className="flex-1 justify-start min-w-[100px] text-muted-foreground font-normal">
                {selectedOptions.length > 0 ? `(${selectedOptions.length}) selected` : placeholder}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search..." 
                  value={inputValue}
                  onValueChange={setInputValue}
                />
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  <CommandGroup>
                    {options
                      .filter(opt => !selectedValues.includes(opt.value))
                      .filter(opt => opt.label.toLowerCase().includes(inputValue.toLowerCase()))
                      .map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => handleSelect(option.value)}
                      >
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
};

export default MultiSelectChipInput;