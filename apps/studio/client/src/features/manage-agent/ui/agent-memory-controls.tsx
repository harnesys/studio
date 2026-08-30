import type { ReactNode } from 'react';

import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export function PortSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FieldSet className="gap-2">
      <FieldLegend className="font-medium text-muted-foreground text-xs">{title}</FieldLegend>
      <FieldGroup className="gap-2">{children}</FieldGroup>
    </FieldSet>
  );
}

export function ImplSelect({
  id,
  label,
  value,
  items,
  onChange,
}: {
  id: string;
  label?: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      {label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            onChange(next);
          }
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-full" align="start">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function SpecNumber({
  id,
  label,
  value,
  onChange,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}
