export type Building = {
  id: string;
  name: string;
  shortName: string;
  kind: string;
  floors: number;
  training: string;
  minutes: number;
  status: 'active' | 'closed';
  code: string;
  art: 'residence' | 'school' | 'office';
};
export const buildings: readonly Building[] = [
  {
    id: 'an-binh',
    name: 'Chung cư An Bình',
    shortName: 'An Bình',
    kind: 'Chung cư',
    floors: 6,
    training: 'Thoát hiểm khi có khói ở hành lang',
    minutes: 8,
    status: 'active',
    code: 'F3D-ANBINH',
    art: 'residence',
  },
  {
    id: 'hoa-sen',
    name: 'Trường học Hoa Sen',
    shortName: 'Hoa Sen',
    kind: 'Trường học',
    floors: 3,
    training: 'Làm quen đường sơ tán tại trường',
    minutes: 6,
    status: 'active',
    code: 'F3D-HOASEN',
    art: 'school',
  },
  {
    id: 'minh-khai',
    name: 'Văn phòng Minh Khai',
    shortName: 'Minh Khai',
    kind: 'Văn phòng',
    floors: 5,
    training: 'Sơ tán khỏi tầng làm việc',
    minutes: 10,
    status: 'closed',
    code: 'F3D-MINHKHAI',
    art: 'office',
  },
];
export type SavedBuilding = { id: string; scannedAt: string };
export function resolveDemoCode(raw: string): Building {
  const value = raw.trim();
  if (value.length > 256) throw new Error('Mã QR không hợp lệ. Hãy kiểm tra và thử lại.');
  // Exact allowlist: never open arbitrary QR URLs or fetch attacker-controlled hosts.
  const building = buildings.find(
    (item) => item.code === value.toUpperCase() || `fire3d://demo/${item.id}` === value,
  );
  if (!building)
    throw new Error('Chưa nhận diện được mã. Bản trải nghiệm chỉ hỗ trợ mã mẫu Fire3D bên dưới.');
  return building;
}
export function saveBuilding(
  current: SavedBuilding[],
  building: Building,
  now = new Date().toISOString(),
): SavedBuilding[] {
  return [
    { id: building.id, scannedAt: now },
    ...current.filter((item) => item.id !== building.id),
  ];
}
export function matchBuilding(building: Building, query: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  return normalize(building.name).includes(normalize(query.trim()));
}
export function getLaunchIssue(building: Building): string | null {
  return building.status === 'closed'
    ? 'Bài tập này đã đóng. Quét mã QR mới được cung cấp tại tòa nhà để tham gia bài tập đang mở.'
    : null;
}
