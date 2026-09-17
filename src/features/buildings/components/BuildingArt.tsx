import { Image, type StyleProp, type ImageStyle } from 'react-native';
import type { Building } from '../buildings.model';
const sources = {
  residence: require('../../../../assets/images/building-residence.png'),
  school: require('../../../../assets/images/building-school.png'),
  office: require('../../../../assets/images/building-office.png'),
};
export function BuildingArt({
  kind = 'residence',
  style,
}: {
  kind?: Building['art'];
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      accessible={false}
      source={sources[kind]}
      resizeMode="contain"
      style={[{ width: 180, height: 180 }, style]}
    />
  );
}
