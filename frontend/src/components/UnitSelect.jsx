import { FormControl, InputLabel, ListSubheader, MenuItem, Select } from '@mui/material';
import { UNIT_GROUPS, UNITS } from '../config/units';

// The product Unit dropdown, grouped (Count, Weight, ...). A unit that isn't in the list (e.g. one that came in
// with an Excel import, like "kg" or "Feet") is shown at the top as the product's current unit, so editing the
// product shows it and saving keeps it unchanged.
function UnitSelect({ value, onChange, ...formControlProps }) {
  const items = [];
  if (value && !UNITS.includes(value)) {
    items.push(<ListSubheader key="h-current">Current (not in the list)</ListSubheader>);
    items.push(<MenuItem key="current" value={value}>{value}</MenuItem>);
  }
  for (const group of UNIT_GROUPS) {
    items.push(<ListSubheader key={`h-${group.label}`}>{group.label}</ListSubheader>);
    for (const unit of group.units) {
      items.push(<MenuItem key={unit} value={unit}>{unit}</MenuItem>);
    }
  }

  return (
    <FormControl {...formControlProps}>
      <InputLabel id="unit-select-label">Unit</InputLabel>
      <Select
        labelId="unit-select-label"
        label="Unit"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
      >
        {items}
      </Select>
    </FormControl>
  );
}

export default UnitSelect;
