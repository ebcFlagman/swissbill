import type { ReactNode } from 'react';
import { Label } from '@primereact/ui/label';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}

/** Beschriftung, Eingabe und Fehlermeldung eines Formularfelds. */
export function Field({ label, htmlFor, error, children, className }: FieldProps) {
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <small id={`${htmlFor}-error`} className="field-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
