import { useRef, useState, type ChangeEvent } from 'react';
import { AutoComplete } from '@primereact/ui/autocomplete';
import { InputText } from '@primereact/ui/inputtext';
import type { Address } from '../../shared/domain/address';
import { applySuggestion, type AddressSuggestion } from '../../shared/domain/address-suggestion';
import { formatIban, ibanFeedback } from '../../shared/domain/iban';
import { useAddressSuggestions } from '../lib/use-address-suggestions';
import { Field } from './Field';

interface AddressFieldsProps<T extends Address> {
  /** Feldpräfix für Fehlermeldungen und IDs: `sender`, `debtor` oder `customer` */
  prefix: string;
  value: T;
  onChange: (value: T) => void;
  errors: Record<string, string>;
  disabled?: boolean;
  /** Zeigt zusätzlich das IBAN-Feld (nur beim Absender) */
  withIban?: boolean;
}

export function AddressFields<T extends Address & { iban?: string }>({
  prefix,
  value,
  onChange,
  errors,
  disabled,
  withIban,
}: AddressFieldsProps<T>) {
  const set = (key: keyof T) => (event: { target: { value: string } }) =>
    onChange({ ...value, [key]: event.target.value });
  const id = (name: string) => `${prefix}-${name}`;
  const error = (name: string) => errors[`${prefix}.${name}`];
  const { suggestions, hint, search, clear } = useAddressSuggestions(!disabled);
  const selectedLabel = useRef<string | null>(null);

  // Sofortprüfung der IBAN: ein Fehler aus dem Ausstellen/Speichern hat Vorrang vor der Prüfung beim Tippen
  const [ibanLeft, setIbanLeft] = useState(false);
  const iban = value.iban ?? '';
  const ibanError = error('iban') ?? ibanFeedback(iban, ibanLeft) ?? undefined;

  return (
    <div className="grid">
      <Field label="Name" htmlFor={id('name')} error={error('name')} className="span-6">
        <InputText id={id('name')} fluid value={value.name} onChange={set('name')} invalid={!!error('name')} disabled={disabled} />
      </Field>
      <Field label="Strasse" htmlFor={id('street')} error={error('street')} className="span-4">
        {/* Vorschläge nur mit hinterlegtem Geoapify-Key (sonst bleibt die Liste leer, die Eingabe wie bisher);
            der Baustein wartet 0,3 s Tipppause und mindestens 3 Zeichen ab. */}
        <AutoComplete.Root
          options={suggestions}
          optionLabel="label"
          inputValue={value.street}
          onInputValueChange={(event: { query: string }) => {
            // Der Baustein meldet nach der Auswahl die Anzeigezeile als Eingabe; die übernommene Strasse behält Vorrang
            if (selectedLabel.current !== null && event.query === selectedLabel.current) {
              selectedLabel.current = null;
              return;
            }
            selectedLabel.current = null;
            onChange({ ...value, street: event.query });
            if (event.query.trim() === '') clear();
          }}
          onValueChange={(event: { option?: unknown }) => {
            const suggestion = event.option as AddressSuggestion | undefined;
            if (suggestion) {
              selectedLabel.current = suggestion.label;
              onChange(applySuggestion(value, suggestion));
              clear();
            }
          }}
          onComplete={(event: { query: string }) => search(event.query)}
          delay={300}
          minLength={3}
          disabled={disabled}
          invalid={!!error('street')}
        >
          <AutoComplete.Input as={InputText} id={id('street')} fluid />
          {suggestions.length > 0 ? (
            <AutoComplete.Portal>
              <AutoComplete.Positioner>
                <AutoComplete.Popup>
                  <AutoComplete.List style={{ maxHeight: '14rem' }}>
                    {suggestions.map((suggestion, index) => (
                      <AutoComplete.Option key={suggestion.label} index={index} uKey={suggestion.label}>
                        {suggestion.label}
                      </AutoComplete.Option>
                    ))}
                  </AutoComplete.List>
                </AutoComplete.Popup>
              </AutoComplete.Positioner>
            </AutoComplete.Portal>
          ) : null}
        </AutoComplete.Root>
        {hint ? (
          <small className="hint" data-testid={`${prefix}-suggest-hint`}>
            {hint}
          </small>
        ) : null}
      </Field>
      <Field label="Nr." htmlFor={id('houseNo')} error={error('houseNo')} className="span-2">
        <InputText id={id('houseNo')} fluid value={value.houseNo} onChange={set('houseNo')} invalid={!!error('houseNo')} disabled={disabled} />
      </Field>
      <Field label="PLZ" htmlFor={id('zip')} error={error('zip')} className="span-2">
        <InputText id={id('zip')} fluid value={value.zip} onChange={set('zip')} invalid={!!error('zip')} disabled={disabled} />
      </Field>
      <Field label="Ort" htmlFor={id('city')} error={error('city')} className="span-4">
        <InputText id={id('city')} fluid value={value.city} onChange={set('city')} invalid={!!error('city')} disabled={disabled} />
      </Field>
      <Field label="Land" htmlFor={id('country')} error={error('country')} className="span-2">
        <InputText id={id('country')} fluid value={value.country} onChange={set('country')} invalid={!!error('country')} disabled={disabled} />
      </Field>
      {withIban ? (
        <Field label="IBAN / QR-IBAN" htmlFor={id('iban')} error={ibanError} className="span-4">
          <InputText
            id={id('iban')}
            fluid
            value={iban}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setIbanLeft(false);
              set('iban' as keyof T)(event);
            }}
            onBlur={() => {
              // Beim Verlassen: unvollständige IBAN melden und in Vierergruppen darstellen
              setIbanLeft(true);
              const formatted = formatIban(iban);
              if (formatted !== iban) onChange({ ...value, iban: formatted });
            }}
            invalid={!!ibanError}
            disabled={disabled}
            placeholder="CH.. .... .... .... .... ."
          />
        </Field>
      ) : null}
    </div>
  );
}
