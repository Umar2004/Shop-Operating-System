import { memo } from 'react';
import { Autocomplete, TextField } from '@mui/material';

// Searchable category filter (replaces the wall of ~280 chips). Choosing a category does what clicking its chip
// did: it puts the category name in the Search box, so the same (debounced) server search runs and the results are
// the same. Clearing it clears the search. It shows a category as chosen while the search is exactly its name.
function CategoryFilter({ categories, search, onSelect }) {
  const value = categories.find((c) => c.name === search) || null;
  return (
    <Autocomplete
      size="small"
      options={categories}
      getOptionLabel={(c) => c.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      value={value}
      onChange={(_, c) => onSelect(c ? c.name : '')}
      sx={{ minWidth: 260 }}
      renderInput={(params) => <TextField {...params} label="Filter by category" placeholder="Type to find a category" />}
    />
  );
}

export default memo(CategoryFilter);
