// Text/TextInput rendered with IBM Plex Sans Arabic (covers Arabic and Latin).
// Android ignores fontWeight for custom fonts, so weight is mapped to the matching font file.
import React from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';

const FAMILY = {
  100: 'IBMPlexSansArabic_400Regular', 200: 'IBMPlexSansArabic_400Regular', 300: 'IBMPlexSansArabic_400Regular',
  400: 'IBMPlexSansArabic_400Regular', normal: 'IBMPlexSansArabic_400Regular', 500: 'IBMPlexSansArabic_500Medium',
  600: 'IBMPlexSansArabic_600SemiBold', 700: 'IBMPlexSansArabic_700Bold', bold: 'IBMPlexSansArabic_700Bold', 800: 'IBMPlexSansArabic_700Bold', 900: 'IBMPlexSansArabic_700Bold',
};
function withFont(style) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return style;
  const { fontWeight = '400', ...rest } = flat;
  return { ...rest, fontFamily: FAMILY[fontWeight] || FAMILY[400] };
}
export const Text = React.forwardRef(({ style, ...p }, ref) => <RNText ref={ref} {...p} style={withFont(style)} />);
export const TextInput = React.forwardRef(({ style, ...p }, ref) => <RNTextInput ref={ref} {...p} style={withFont(style)} />);
