import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAppStore } from '../store';

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const enabled = useAppStore(s => s.biometricLockEnabled); const [locked,setLocked]=useState(false);
  const unlock=useCallback(async()=>{if(!enabled)return setLocked(false);const ready=await LocalAuthentication.hasHardwareAsync()&&await LocalAuthentication.isEnrolledAsync();if(!ready)return;const result=await LocalAuthentication.authenticateAsync({promptMessage:'Unlock HisabKitab',fallbackLabel:'Use device passcode'});setLocked(!result.success);},[enabled]);
  useEffect(()=>{void unlock();const sub=AppState.addEventListener('change',state=>{if(state!=='active'&&enabled)setLocked(true);if(state==='active')void unlock();});return()=>sub.remove();},[enabled,unlock]);
  if(!locked)return <>{children}</>;return <View style={styles.page}><Text style={styles.title}>HisabKitab is locked</Text><Text style={styles.copy}>Authenticate with your device to view private ledger data.</Text><TouchableOpacity style={styles.button} onPress={()=>void unlock()}><Text style={styles.buttonText}>Unlock</Text></TouchableOpacity></View>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#0F172A',justifyContent:'center',alignItems:'center',padding:28},title:{color:'#F8FAFC',fontWeight:'800',fontSize:24},copy:{color:'#94A3B8',textAlign:'center',marginTop:10,lineHeight:20},button:{backgroundColor:'#10B981',paddingHorizontal:28,paddingVertical:14,borderRadius:10,marginTop:24},buttonText:{color:'#fff',fontWeight:'800'}});
