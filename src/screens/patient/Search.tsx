import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AppTabParamList, MainStackParamList } from '../../navigation/types'
import Icon from '../../components/ui/Icon'
import { catalogApi, type Medicine } from '../../api/catalog'
import { useCartStore } from '../../store/cartStore'
import { colors } from '../../theme/colors'

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Search'>,
  NativeStackScreenProps<MainStackParamList>
>

const FILTERS = ['Tous', 'Ouvert maintenant', 'Garde de nuit', 'Sur ordonnance', 'Sans ordonnance']
const SORT_OPTIONS = ['Pertinence', 'Prix croissant', 'Distance']

// Mobile port of the web app's Search.tsx. Same debounced search (400ms),
// same filter chips and sort options, same medicine-card add-to-cart
// interaction. Two deliberate differences from web:
//  - Single-column card list instead of a 2-col grid + side map panel --
//    there's no room for a split layout on a phone, and cards need their
//    full width for the add-to-cart controls to be comfortably tappable.
//  - The map panel is dropped entirely rather than faked with a static
//    placeholder. A real interactive map (pharmacy pins, radius, tap to
//    select) is its own feature worth building properly later, likely
//    with react-native-maps -- not something to approximate here.
//  - Sort is a tap-to-cycle chip instead of a <select>, since RN has no
//    native dropdown; simplest option that needs no extra dependency.
export default function Search({ navigation, route }: Props) {
  const initialQuery = (route.params as { q?: string } | undefined)?.q ?? ''
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [activeFilter, setActiveFilter] = useState('Tous')
  const [sortIndex, setSortIndex] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const items = useCartStore((s) => s.items)
  const addItem = useCartStore((s) => s.addItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const getCartItem = (id: number) => items.find((i) => i.medicine.id === id)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearched(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await catalogApi.search({ q, limit: 20 })
        setResults(res.data)
        setSearched(true)
      } catch {
        setResults([])
        setSearched(true)
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const resultsLabel = searched
    ? `${results.length} médicament${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}${query ? ` pour « ${query} »` : ''}`
    : 'Recherchez un médicament'

  return (
    <View style={styles.screen}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Icon name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un médicament..."
          placeholderTextColor={colors.textMuted}
          autoFocus={!initialQuery}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : query ? (
          <Pressable onPress={() => setQuery('')}>
            <Icon name="close" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter chips */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <Pressable
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>{f}</Text>
          </Pressable>
        )}
      />

      {/* Results header */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsLabel} numberOfLines={2}>
          {resultsLabel}
        </Text>
        <View style={styles.resultsActions}>
          {cartCount > 0 && (
            <Pressable style={styles.cartPill} onPress={() => navigation.navigate('Cart')}>
              <Icon name="shopping_cart" size={14} color={colors.white} />
              <Text style={styles.cartPillText}>
                {cartCount} article{cartCount > 1 ? 's' : ''}
              </Text>
            </Pressable>
          )}
          <Pressable style={styles.sortChip} onPress={() => setSortIndex((i) => (i + 1) % SORT_OPTIONS.length)}>
            <Icon name="sort" size={14} color={colors.textSecondary} />
            <Text style={styles.sortChipText}>{SORT_OPTIONS[sortIndex]}</Text>
          </Pressable>
        </View>
      </View>

      {/* Results list */}
      {!searched && !query ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Icon name="medication" size={36} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Saisissez le nom d'un médicament</Text>
          <Text style={styles.emptySubtitle}>Ex: Doliprane, Amoxicilline, Ibuprofène…</Text>
        </View>
      ) : searched && results.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Icon name="search_off" size={36} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Aucun résultat pour « {query} »</Text>
          <Text style={styles.emptySubtitle}>Essayez un autre nom ou le principe actif</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item: med }) => {
            const cartItem = getCartItem(med.id)
            return (
              <MedicineCard
                medicine={med}
                cartItem={cartItem}
                onAdd={() => addItem(med)}
                onIncrease={() => cartItem && updateQuantity(med.id, cartItem.quantity + 1)}
                onDecrease={() => cartItem && updateQuantity(med.id, cartItem.quantity - 1)}
              />
            )
          }}
        />
      )}
    </View>
  )
}

function MedicineCard({
  medicine,
  cartItem,
  onAdd,
  onIncrease,
  onDecrease,
}: {
  medicine: Medicine
  cartItem: { quantity: number } | undefined
  onAdd: () => void
  onIncrease: () => void
  onDecrease: () => void
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardIcon}>
          <Icon name="medication" size={26} color={colors.primary} />
        </View>
        {medicine.requires_prescription ? (
          <View style={styles.badgeAmber}>
            <Text style={styles.badgeAmberText}>Sur ordonnance</Text>
          </View>
        ) : (
          <View style={styles.badgeGreen}>
            <Text style={styles.badgeGreenText}>Sans ordonnance</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardName}>{medicine.name}</Text>
      {!!medicine.generic_name && <Text style={styles.cardGeneric}>{medicine.generic_name}</Text>}

      <View style={styles.cardLocation}>
        <Icon name="location_on" size={13} color={colors.textMuted} />
        <Text style={styles.cardLocationText}>Casablanca</Text>
      </View>

      <View style={styles.cardActions}>
        <Pressable style={styles.detailsButton}>
          <Text style={styles.detailsButtonText}>Voir détails</Text>
        </Pressable>
        {!cartItem ? (
          <Pressable style={styles.addButton} onPress={onAdd}>
            <Text style={styles.addButtonText}>Commander</Text>
          </Pressable>
        ) : (
          <View style={styles.qtyControl}>
            <Pressable style={styles.qtyButton} onPress={onDecrease}>
              <Icon name="remove" size={14} color={colors.primary} />
            </Pressable>
            <Text style={styles.qtyText}>{cartItem.quantity}</Text>
            <Pressable style={styles.qtyButton} onPress={onIncrease}>
              <Icon name="add" size={14} color={colors.primary} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#d2d9f4', paddingTop: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    marginHorizontal: 16,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  filterChipTextActive: { color: colors.white },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  resultsLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  resultsActions: { flexDirection: 'row', gap: 6 },
  cartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cartPillText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sortChipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  emptySubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeAmber: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeAmberText: { fontSize: 9, fontWeight: '700', color: '#92400e' },
  badgeGreen: { backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeGreenText: { fontSize: 9, fontWeight: '700', color: '#15803d' },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardGeneric: { fontSize: 12, color: colors.textMuted, marginTop: -4 },
  cardLocation: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardLocationText: { fontSize: 11, color: colors.textSecondary },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  detailsButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  detailsButtonText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  addButton: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  addButtonText: { fontSize: 12, fontWeight: '700', color: colors.white },
  qtyControl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  qtyButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 13, fontWeight: '700', color: colors.primary },
})