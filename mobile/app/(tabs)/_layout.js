import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppProvider';

export default function TabsLayout() {
  const { token, t, colors: c, unread } = useApp();
  if (!token) return <Redirect href="/login" />;
  const icon = (name) => ({ color, focused }) => <Ionicons name={focused ? name : `${name}-outline`} size={24} color={color} />;
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: c.card }, headerTintColor: c.ink, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: 'IBMPlexSansArabic_700Bold', fontSize: 18 },
      tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
      tabBarLabelStyle: { fontFamily: 'IBMPlexSansArabic_500Medium', fontSize: 11 },
    }}>
      <Tabs.Screen name="home" options={{ title: 'Query', tabBarLabel: t('categories'), tabBarIcon: icon('grid') }} />
      <Tabs.Screen name="feed" options={{ title: t('latestQuestions'), tabBarIcon: icon('newspaper') }} />
      <Tabs.Screen name="notifications" options={{
        title: t('notifications'), tabBarIcon: icon('notifications'),
        tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined, tabBarBadgeStyle: { backgroundColor: c.danger, fontSize: 11 },
      }} />
      <Tabs.Screen name="profile" options={{ title: t('profile'), tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
