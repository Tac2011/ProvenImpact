import { MONTHS } from '@/lib/education';

export function MonthYear({
  label,
  month,
  year,
  years,
  onChange,
  error,
}: {
  label: string;
  month: number | null;
  year: number | null;
  years: number[];
  onChange: (month: number | null, year: number | null) => void;
  error?: string;
}) {
  const toNumber = (value: string) => (value ? Number(value) : null);

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1">{label}</legend>
      <div className="flex gap-2">
        <select
          aria-label={`${label}: month`}
          value={month ?? ''}
          onChange={(e) => onChange(toNumber(e.target.value), year)}
          className="rounded border px-3 py-2"
        >
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label}: year`}
          value={year ?? ''}
          onChange={(e) => onChange(month, toNumber(e.target.value))}
          className="rounded border px-3 py-2"
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </fieldset>
  );
}
