import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, PageHeader } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors, fonts } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { buildings, matchBuilding, type Building } from '../buildings.model';
import { BuildingArt } from '../components/BuildingArt';
import { BuildingSheet } from '../components/BuildingSheet';
export default function BuildingListScreen() {
  const { state } = useDemo();
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState<Building | null>(null);
  const items = buildings.filter(
    (b) => state.saved.some((s) => s.id === b.id) && matchBuilding(b, query),
  );
  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <PageHeader title="Tòa nhà đã lưu" onBack={() => router.back()} />
        <View style={styles.search}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            accessibilityLabel="Tìm tòa nhà"
            placeholder="Tìm theo tên tòa nhà"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.input}
          />
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mở ${item.name}`}
            onPress={() => setSelected(item)}
            style={styles.card}
          >
            <BuildingArt kind={item.art} style={styles.art} />
            <View style={styles.info}>
              <Text variant="small" muted>
                {item.kind}
              </Text>
              <Text variant="label">{item.name}</Text>
              <Text
                variant="small"
                style={{ color: item.status === 'active' ? colors.green : colors.red }}
              >
                {item.status === 'active' ? 'Có bài tập đang mở' : 'Bài tập đã đóng'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={42} color={colors.muted} />
            <Text variant="heading">
              {query ? 'Chưa tìm thấy tòa nhà' : 'Bạn chưa lưu tòa nhà nào'}
            </Text>
            <Text muted>
              {query ? 'Thử tên khác hoặc tìm không dấu.' : 'Quét QR để thêm tòa nhà vào sảnh.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          <Button
            title="Quét QR thêm tòa nhà"
            icon="qr-code-outline"
            onPress={() => router.push('/scan')}
          />
        }
      />
      <BuildingSheet building={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  header: { padding: 24, gap: 22 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, minHeight: 54, fontFamily: fonts.regular, color: colors.ink },
  list: { paddingHorizontal: 24, paddingBottom: 30, gap: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  art: { width: 83, height: 100 },
  info: { flex: 1, gap: 5 },
  empty: { alignItems: 'center', gap: 15, paddingVertical: 55 },
});
