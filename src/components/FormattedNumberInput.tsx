import React from 'react';
import { formatCurrency, parseCurrencyInput } from '../utils/formatters';

export interface FormattedNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string | number | null | undefined;
  onChange: (value: string, numValue: number) => void;
  prefix?: string;
  allowNegative?: boolean;
}

export { formatCurrency };

export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onChange,
  prefix,
  className = '',
  placeholder = '0',
  allowNegative = false,
  disabled,
  required,
  id,
  name,
  onBlur,
  onFocus,
  autoFocus,
  readOnly,
  ...rest
}) => {
  const displayValue = formatCurrency(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { rawString, numberValue } = parseCurrencyInput(e.target.value, allowNegative);
    onChange(rawString, numberValue);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      required={required}
      id={id}
      name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      autoFocus={autoFocus}
      readOnly={readOnly}
      {...rest}
    />
  );
};

export default FormattedNumberInput;
