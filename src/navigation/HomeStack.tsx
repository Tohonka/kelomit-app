import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import DayScreen from '../screens/DayScreen';
import type {HomeStackParamList} from './navigationTypes';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator>
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