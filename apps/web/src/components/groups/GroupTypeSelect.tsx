"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { DEFAULT_GROUP_TYPE_COLOR, type GroupTypeDef } from "@/lib/groupTypes";

interface GroupTypeSelectProps {
  id?: string;
  types: GroupTypeDef[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function GroupTypeSelect({
  id,
  types,
  value,
  onValueChange,
  disabled,
  placeholder = "— Selecione o tipo —",
}: GroupTypeSelectProps) {
  const selected = types.find((t) => t.id === value) ?? null;

  return (
    <Select.Root
      value={value || null}
      onValueChange={(v) => onValueChange((v as string | null) ?? "")}
      disabled={disabled || types.length === 0}
    >
      <Select.Trigger
        id={id}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <>
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: selected.color || DEFAULT_GROUP_TYPE_COLOR }}
              />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-stone">{placeholder}</span>
          )}
        </span>
        <Select.Icon className="flex-shrink-0 text-stone">
          <ChevronDown size={14} strokeWidth={1.5} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-50" sideOffset={4}>
          <Select.Popup className="w-[var(--anchor-width)] min-w-[200px] max-h-[280px] overflow-y-auto rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] p-1 shadow-[var(--shadow-lg)]">
            <Select.List>
              {types.map((t) => (
                <Select.Item
                  key={t.id}
                  value={t.id}
                  className="flex cursor-default items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-[var(--surface-subtle)] dark:text-white"
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: t.color || DEFAULT_GROUP_TYPE_COLOR }}
                  />
                  <Select.ItemText className="flex-1 truncate">{t.name}</Select.ItemText>
                  <Select.ItemIndicator className="flex-shrink-0 text-navy dark:text-white">
                    <Check size={13} strokeWidth={2} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
