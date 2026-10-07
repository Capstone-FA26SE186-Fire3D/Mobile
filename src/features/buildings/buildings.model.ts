export type Building = {
  id: string;
  name: string;
  shortName: string;
  kind: string;
  floors: number;
  trainings: readonly DemoTraining[];
  status: 'active' | 'closed';
  code: string;
  art: 'residence' | 'school' | 'office';
};
export type TrainingMode = 'learn' | 'guided' | 'assessment';
export type DemoTraining = {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  status: 'active' | 'closed';
};
export const trainingModes: readonly {
  id: TrainingMode;
  title: string;
  shortTitle: string;
  description: string;
  icon: 'eye-outline' | 'navigate-outline' | 'clipboard-outline';
}[] = [
  {
    id: 'learn',
    title: 'Learn',
    shortTitle: 'Làm quen',
    description: 'Khám phá mốc không gian với nhãn và gợi ý luôn hiển thị.',
    icon: 'eye-outline',
  },
  {
    id: 'guided',
    title: 'Guided Drill',
    shortTitle: 'Có hướng dẫn',
    description: 'Thử lựa chọn tuyến và nhận phản hồi khi điều kiện thay đổi.',
    icon: 'navigate-outline',
  },
  {
    id: 'assessment',
    title: 'Assessment',
    shortTitle: 'Đánh giá',
    description: 'Ẩn gợi ý, ghi quyết định và chấm theo rubric mô phỏng.',
    icon: 'clipboard-outline',
  },
];
export const buildings: readonly Building[] = [
  {
    id: 'an-binh',
    name: 'Chung cư An Bình',
    shortName: 'An Bình',
    kind: 'Chung cư',
    floors: 6,
    trainings: [
      {
        id: 'an-binh-smoke',
        title: 'Khói xuất hiện ở hành lang',
        summary: 'Nhận biết mốc không gian và thử đổi tuyến khi một nhánh bị chặn.',
        minutes: 8,
        status: 'active',
      },
    ],
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
    trainings: [
      {
        id: 'hoa-sen-route',
        title: 'Làm quen đường di chuyển tại trường',
        summary: 'Quan sát hành lang, nút giao và điểm kết thúc trong mô hình.',
        minutes: 6,
        status: 'active',
      },
    ],
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
    trainings: [
      {
        id: 'minh-khai-office',
        title: 'Rời tầng làm việc',
        summary: 'Bài mẫu đã đóng và không thể tạo phiên mới.',
        minutes: 10,
        status: 'closed',
      },
    ],
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

export function findTraining(
  trainingId: string,
): { building: Building; training: DemoTraining } | null {
  for (const building of buildings) {
    const training = building.trainings.find((item) => item.id === trainingId);
    if (training) return { building, training };
  }
  return null;
}
