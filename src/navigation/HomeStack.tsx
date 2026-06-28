import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import DayScreen from '../screens/DayScreen';
import {useTheme} from '../theme';
import type {HomeStackParamList} from './navigationTypes';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  const {colors} = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.bgCard},
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {fontWeight: '600'},
        contentStyle: {backgroundColor: colors.bg},
      }}>
      <Stack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name="DayScreen"
        component={DayScreen}
        options={({route}) => ({title: route.params.date})}
      />
    </Stack.Navigator>
  );
}
