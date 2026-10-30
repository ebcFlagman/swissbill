import type { ChangeEvent } from 'react';
import { Button } from '@primereact/ui/button';
import { InputText } from '@primereact/ui/inputtext';
import { formatChf } from '../../shared/domain/money';
import { emptyItem, itemAmount, type ItemForm } from '../lib/invoice-form';

interface ItemsTableProps {
  items: ItemForm[];
  onChange: (items: ItemForm[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}

export function ItemsTable({ items, onChange, errors, disabled }: ItemsTableProps) {
  const update = (index: number, patch: Partial<ItemForm>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="items">
      <table className="items-table">
        <thead>
          <tr>
            <th scope="col">Beschreibung</th>
            <th scope="col" className="num">Menge</th>
            <th scope="col" className="num">Einzelpreis (CHF)</th>
            <th scope="col" className="num">Betrag (CHF)</th>
            <th scope="col" aria-label="Aktionen" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const amount = itemAmount(item);
            const err = (name: string) => errors[`items.${index}.${name}`];
            return (
              <tr key={item.key}>
                <td>
                  <InputText
                    aria-label={`Beschreibung Position ${index + 1}`}
                    fluid
                    value={item.description}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => update(index, { description: e.target.value })}
                    invalid={!!err('description')}
                    disabled={disabled}
                  />
                  {err('description') ? <small className="field-error" role="alert">{err('description')}</small> : null}
                </td>
                <td className="num">
                  <InputText
                    aria-label={`Menge Position ${index + 1}`}
                    inputMode="decimal"
                    className="num-input"
                    value={item.quantity}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => update(index, { quantity: e.target.value })}
                    invalid={!!err('quantity')}
                    disabled={disabled}
                  />
                  {err('quantity') ? <small className="field-error" role="alert">{err('quantity')}</small> : null}
                </td>
                <td className="num">
                  <InputText
                    aria-label={`Einzelpreis Position ${index + 1}`}
                    inputMode="decimal"
                    className="num-input"
                    value={item.unitPrice}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => update(index, { unitPrice: e.target.value })}
                    invalid={!!err('unitPrice')}
                    disabled={disabled}
                  />
                  {err('unitPrice') ? <small className="field-error" role="alert">{err('unitPrice')}</small> : null}
                </td>
                <td className="num amount" aria-label={`Betrag Position ${index + 1}`}>
                  {amount === null ? '–' : formatChf(amount)}
                </td>
                <td>
                  <Button
                    variant="text"
                    severity="secondary"
                    aria-label={`Position ${index + 1} entfernen`}
                    onClick={() => remove(index)}
                    disabled={disabled || items.length === 1}
                  >
                    Entfernen
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {errors['items'] ? <small className="field-error" role="alert">{errors['items']}</small> : null}
      <div className="items-actions">
        <Button variant="outlined" onClick={() => onChange([...items, emptyItem()])} disabled={disabled}>
          Position hinzufügen
        </Button>
      </div>
    </div>
  );
}
