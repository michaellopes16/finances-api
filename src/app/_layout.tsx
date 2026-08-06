import { TamaguiProvider, Theme } from '@tamagui/core'
import { Stack } from 'expo-router'
import config from '../../tamagui.config'

export default function Layout() {
  return (
    <TamaguiProvider config={config} defaultTheme="dark">
      <Theme name="dark">
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: '#121214',
            },
            headerTintColor: '#e1e1e6',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            contentStyle: {
              backgroundColor: '#121214',
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: 'Dashboard Finanças',
              headerShown: false,
            }}
          />
        </Stack>
      </Theme>
    </TamaguiProvider>
  )
}