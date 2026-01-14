# Mobile API Layer TypeScript Migration Example

## Before (HomeScreen.js - Direct axios calls)

```javascript
import axios from 'axios';

const fetchRolls = useCallback(async () => {
  if (!baseUrl) return;
  setLoading(true);
  setError(null);
  try {
    const res = await axios.get(`${baseUrl}/api/rolls`);
    setRolls(res.data);  // No type safety for res.data
  } catch (err) {
    setError('Failed to connect to server. Check Settings.');
  } finally {
    setLoading(false);
  }
}, [baseUrl]);
```

## After (HomeScreen.tsx - Type-safe API service)

```typescript
import * as api from '../services/apiService';
import type { Roll } from '@filmgallery/types';

const fetchRolls = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const rolls: Roll[] = await api.getRolls();  // ✅ Type-safe
    setRolls(rolls);  // ✅ IDE autocomplete for Roll properties
  } catch (err) {
    setError('Failed to connect to server. Check Settings.');
  } finally {
    setLoading(false);
  }
}, []);
```

## Benefits

1. **Type Safety**: `rolls` is typed as `Roll[]`, preventing property access errors
2. **Autocomplete**: IDE shows all available properties (`id`, `title`, `film_id`, etc.)
3. **Refactor Safety**: Renaming API endpoints updates all usages
4. **Centralized Logic**: All API calls in one place, easy to add interceptors/caching
5. **No baseUrl dependency**: `apiService` uses `axios.defaults.baseURL` internally

## Migration Steps for Screens

For each Screen component (`HomeScreen`, `RollDetailScreen`, etc.):

1. **Rename file**: `HomeScreen.js` → `HomeScreen.tsx`
2. **Import API service**: `import * as api from '../services/apiService'`
3. **Add type imports**: `import type { Roll } from '@filmgallery/types'`
4. **Replace axios calls**:
   ```typescript
   // Before
   const res = await axios.get(`${baseUrl}/api/rolls`);
   setRolls(res.data);
   
   // After
   const rolls = await api.getRolls();
   setRolls(rolls);
   ```
5. **Add component props interface**:
   ```typescript
   interface HomeScreenProps {
     navigation: any;  // TODO: Type with RootStackParamList
   }
   
   export default function HomeScreen({ navigation }: HomeScreenProps) {
     // ...
   }
   ```

## Already Migrated

- ✅ `mobile/src/services/apiService.ts` - Type-safe API layer
- ✅ `mobile/src/types/index.ts` - Mobile-specific types
- ✅ `mobile/tsconfig.json` - TypeScript configuration

## TODO: Screen Migration Priority

1. **HomeScreen** - Most used, fetches rolls
2. **RollDetailScreen** - Fetches roll details + photos
3. **PhotoViewScreen** - Updates photo caption/rating
4. **FavoritesScreen** - Fetches favorites
5. **NegativeScreen** - Fetches negatives
6. **FilmsScreen** - Fetches films
7. **ThemesScreen** - Fetches tags
8. **TagDetailScreen** - Fetches tag photos
9. **SettingsScreen** - Health check

## Server Test Compatibility

All mobile API calls should work with existing server tests:
- ✅ 31 server tests passing (roll-creation, thumbnail-service, image-lut)
- ✅ API endpoints unchanged (only adding type safety on client)
- ✅ No breaking changes to server API
