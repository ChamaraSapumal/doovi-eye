import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  PanResponder,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Rect, Path, G } from 'react-native-svg';
import Slider from '@react-native-community/slider';
import { Accelerometer } from 'expo-sensors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// List of available animations
const ANIMATIONS = [
  { id: 0, name: 'Wake Up', icon: '☀️', color: '#007AFF', desc: 'Eyes open wide' },
  { id: 7, name: 'Deep Sleep', icon: '💤', color: '#5856D6', desc: 'Flat line sleep' },
  { id: 6, name: 'Happy Eyes', icon: '😊', color: '#34C759', desc: 'Triangular smile' },
  { id: 5, name: 'Short Blink', icon: '😉', color: '#FF9500', desc: 'Quick wink' },
  { id: 4, name: 'Long Blink', icon: '👁️', color: '#FF3B30', desc: 'Slow blink' },
  { id: 8, name: 'Saccade', icon: '🌀', color: '#AF52DE', desc: 'Look around' },
  { id: 3, name: 'Gaze Left', icon: '⬅️', color: '#007AFF', desc: 'Shift gaze left' },
  { id: 2, name: 'Gaze Right', icon: '➡️', color: '#007AFF', desc: 'Shift gaze right' },
  { id: 1, name: 'Center', icon: '🔄', color: '#8E8E93', desc: 'Reset position' },
];

export default function App() {
  const [ipAddress, setIpAddress] = useState('192.168.4.1');
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // DISCONNECTED, CONNECTING, CONNECTED
  const [demoMode, setDemoMode] = useState(true);
  const [sensorModeEnabled, setSensorModeEnabled] = useState(false);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState('Dashboard'); // 'Dashboard', 'Control', 'Settings'

  // Eye configurations
  const [eyeWidth, setEyeWidth] = useState(40);
  const [eyeHeight, setEyeHeight] = useState(40);
  const [cornerRadius, setCornerRadius] = useState(10);
  
  // Real-time animation states for preview
  const [virtualXOffset, setVirtualXOffset] = useState(0);
  const [virtualYOffset, setVirtualYOffset] = useState(0);
  const [eyeState, setEyeState] = useState('normal'); 

  // Joystick position tracker
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const joystickScale = useRef(new Animated.Value(1)).current;

  // WebSockets ref
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);

  const connectWebSocket = () => {
    if (ws.current) {
      ws.current.close();
    }
    setConnectionStatus('CONNECTING');
    const wsUrl = `ws://${ipAddress}:81`;
    try {
      ws.current = new WebSocket(wsUrl);
      ws.current.onopen = () => {
        setConnectionStatus('CONNECTED');
      };
      ws.current.onmessage = (e) => {
        console.log('Received message from ESP32:', e.data);
      };
      ws.current.onerror = (e) => {
        setConnectionStatus('DISCONNECTED');
      };
      ws.current.onclose = (e) => {
        setConnectionStatus('DISCONNECTED');
        reconnectTimeout.current = setTimeout(() => {
          if (connectionStatus === 'CONNECTING') connectWebSocket();
        }, 3000);
      };
    } catch (err) {
      setConnectionStatus('DISCONNECTED');
    }
  };

  const disconnectWebSocket = () => {
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    if (ws.current) ws.current.close();
    setConnectionStatus('DISCONNECTED');
  };

  const sendCommand = (cmd) => {
    if (ws.current && connectionStatus === 'CONNECTED') {
      ws.current.send(cmd);
    }
  };

  const lastSentTime = useRef(0);
  const sendJoystickCoords = (x, y, force = false) => {
    const now = Date.now();
    if (force || now - lastSentTime.current > 40) { 
      sendCommand(`J:${x},${y}`);
      lastSentTime.current = now;
    }
  };

  const joystickLimit = 48;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        Animated.spring(joystickScale, { toValue: 0.9, useNativeDriver: true }).start();
      },
      onPanResponderMove: (evt, gestureState) => {
        setDemoMode(false);
        const dx = gestureState.dx;
        const dy = gestureState.dy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        let x = dx;
        let y = dy;
        if (distance > joystickLimit) {
          x = (dx / distance) * joystickLimit;
          y = (dy / distance) * joystickLimit;
        }
        setJoystickPos({ x, y });
        const mappedX = Math.round((x / joystickLimit) * 12);
        const mappedY = Math.round((y / joystickLimit) * 8);
        setVirtualXOffset(mappedX);
        setVirtualYOffset(mappedY);
        sendJoystickCoords(mappedX, mappedY);
      },
      onPanResponderRelease: () => {
        Animated.spring(joystickScale, { toValue: 1.0, friction: 4, useNativeDriver: true }).start();
        setJoystickPos({ x: 0, y: 0 });
        setVirtualXOffset(0);
        setVirtualYOffset(0);
        sendJoystickCoords(0, 0, true);
      },
    })
  ).current;

  const handleToggleDemoMode = (newMode) => {
    setDemoMode(newMode);
    sendCommand(newMode ? 'D:1' : 'D:0');
  };

  const sendConfigUpdate = (w, h, r) => {
    sendCommand(`C:${h},${w},${r}`);
  };

  const triggerAnimation = (animId) => {
    setDemoMode(false);
    sendCommand(`A${animId}`);
    if (animId === 7) setEyeState('sleeping');
    else if (animId === 0) setEyeState('normal');
    else if (animId === 6) {
      setEyeState('happy');
      setTimeout(() => setEyeState('normal'), 1800);
    } else if (animId === 5 || animId === 4) {
      setEyeState('blinking');
      setTimeout(() => setEyeState('normal'), animId === 5 ? 200 : 450);
    } else if (animId === 1) {
      setEyeState('normal');
      setVirtualXOffset(0);
      setVirtualYOffset(0);
    } else if (animId === 2) {
      setVirtualXOffset(10);
      setTimeout(() => setVirtualXOffset(0), 1200);
    } else if (animId === 3) {
      setVirtualXOffset(-10);
      setTimeout(() => setVirtualXOffset(0), 1200);
    } else if (animId === 8) {
      let count = 0;
      const interval = setInterval(() => {
        setVirtualXOffset(Math.floor(Math.random() * 21) - 10);
        setVirtualYOffset(Math.floor(Math.random() * 13) - 6);
        count++;
        if (count > 10) {
          clearInterval(interval);
          setVirtualXOffset(0);
          setVirtualYOffset(0);
        }
      }, 180);
    }
  };

  // Accelerometer tracking
  useEffect(() => {
    let subscription = null;
    if (sensorModeEnabled) {
      Accelerometer.setUpdateInterval(50);
      subscription = Accelerometer.addListener(accelerometerData => {
        const { x, y } = accelerometerData;
        const mappedX = Math.max(-12, Math.min(12, Math.round(x * 25))); 
        const mappedY = Math.max(-8, Math.min(8, Math.round(-y * 15)));
        setVirtualXOffset(mappedX);
        setVirtualYOffset(mappedY);
        sendJoystickCoords(mappedX, mappedY);
      });
    } else {
      if (subscription) subscription.remove();
    }
    return () => { if (subscription) subscription.remove(); };
  }, [sensorModeEnabled]);

  useEffect(() => {
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws.current) ws.current.close();
    };
  }, []);

  const previewBoxWidth = 280;
  const previewBoxHeight = 130;
  const spaceBetween = 32;

  const leftEyeX = previewBoxWidth / 2 - eyeWidth / 2 - spaceBetween / 2 + virtualXOffset;
  const rightEyeX = previewBoxWidth / 2 + eyeWidth / 2 + spaceBetween / 2 + virtualXOffset;
  const eyeY = previewBoxHeight / 2 + virtualYOffset;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          
          {/* Minimal Header (Visible on all tabs) */}
          <View style={styles.header}>
            <Text style={styles.title}>Doovi's Eyes</Text>
            <Text style={styles.subtitle}>ESP32 Control Dashboard</Text>
          </View>

          {/* TAB 1: DASHBOARD */}
          {activeTab === 'Dashboard' && (
            <View>
              {/* Connection Card */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Connection</Text>
                  <View style={[styles.statusBadge, connectionStatus === 'CONNECTED' && styles.statusBadgeConnected]}>
                    <View style={[styles.statusDot, connectionStatus === 'CONNECTED' && styles.statusDotConnected, connectionStatus === 'CONNECTING' && styles.statusDotConnecting]} />
                    <Text style={[styles.statusText, connectionStatus === 'CONNECTED' && styles.statusTextConnected]}>{connectionStatus}</Text>
                  </View>
                </View>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="192.168.4.1"
                    placeholderTextColor="#A1A1AA"
                    value={ipAddress}
                    onChangeText={setIpAddress}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={[styles.button, connectionStatus === 'CONNECTED' ? styles.buttonDisconnect : styles.buttonConnect]}
                    onPress={connectionStatus === 'CONNECTED' ? disconnectWebSocket : connectWebSocket}
                    disabled={connectionStatus === 'CONNECTING'}
                  >
                    <Text style={[styles.buttonText, connectionStatus === 'CONNECTED' && styles.buttonTextDisconnect]}>
                      {connectionStatus === 'CONNECTED' ? 'Disconnect' : connectionStatus === 'CONNECTING' ? 'Connecting...' : 'Connect'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Clean OLED Simulator */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Live Preview</Text>
                </View>
                <View style={styles.previewContainer}>
                  <View style={styles.oledScreen}>
                    <Svg width={previewBoxWidth} height={previewBoxHeight} viewBox={`0 0 ${previewBoxWidth} ${previewBoxHeight}`}>
                      <G>
                        {/* LEFT EYE */}
                        {eyeState === 'happy' ? (
                          <Path
                            d={`M ${leftEyeX - eyeWidth/2} ${eyeY + 5} Q ${leftEyeX} ${eyeY - eyeHeight/2} ${leftEyeX + eyeWidth/2} ${eyeY + 5}`}
                            fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round"
                          />
                        ) : eyeState === 'sleeping' ? (
                          <Rect x={leftEyeX - eyeWidth/2} y={eyeY - 1.5} width={eyeWidth} height={3} rx={0} fill="#FFFFFF" />
                        ) : (
                          <Rect x={leftEyeX - eyeWidth/2} y={eyeY - (eyeHeight*(eyeState==='blinking'?0.1:1))/2} width={eyeWidth} height={eyeHeight*(eyeState==='blinking'?0.1:1)} rx={cornerRadius} fill="#FFFFFF" />
                        )}

                        {/* RIGHT EYE */}
                        {eyeState === 'happy' ? (
                          <Path
                            d={`M ${rightEyeX - eyeWidth/2} ${eyeY + 5} Q ${rightEyeX} ${eyeY - eyeHeight/2} ${rightEyeX + eyeWidth/2} ${eyeY + 5}`}
                            fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round"
                          />
                        ) : eyeState === 'sleeping' ? (
                          <Rect x={rightEyeX - eyeWidth/2} y={eyeY - 1.5} width={eyeWidth} height={3} rx={0} fill="#FFFFFF" />
                        ) : (
                          <Rect x={rightEyeX - eyeWidth/2} y={eyeY - (eyeHeight*(eyeState==='blinking'?0.1:1))/2} width={eyeWidth} height={eyeHeight*(eyeState==='blinking'?0.1:1)} rx={cornerRadius} fill="#FFFFFF" />
                        )}
                      </G>
                    </Svg>
                  </View>
                </View>
              </View>
              
              {/* Auto Loop Toggle */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Auto Loop Mode</Text>
                <Text style={styles.subtitle}>Cycle through all animations automatically.</Text>
                <View style={[styles.toggleGroup, { marginTop: 16 }]}>
                  <TouchableOpacity style={[styles.toggleBtn, demoMode && styles.toggleBtnActive]} onPress={() => handleToggleDemoMode(true)}>
                    <Text style={[styles.toggleText, demoMode && styles.toggleTextActive]}>ON</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.toggleBtn, !demoMode && styles.toggleBtnActive]} onPress={() => handleToggleDemoMode(false)}>
                    <Text style={[styles.toggleText, !demoMode && styles.toggleTextActive]}>OFF</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* TAB 2: CONTROL */}
          {activeTab === 'Control' && (
            <View>
              {/* Controls Row */}
              <View style={styles.controlRow}>
                {/* Joystick */}
                <View style={[styles.card, styles.halfCard]}>
                  <Text style={styles.cardTitle}>Vector Pad</Text>
                  <View style={styles.joystickAreaContainer}>
                    <View style={styles.joystickOuter}>
                      <Animated.View
                        style={[
                          styles.joystickInner,
                          {
                            transform: [
                              { translateX: joystickPos.x },
                              { translateY: joystickPos.y },
                              { scale: joystickScale }
                            ],
                          },
                        ]}
                        {...panResponder.panHandlers}
                      >
                      </Animated.View>
                    </View>
                  </View>
                </View>

                {/* Sensor Mode Toggle */}
                <View style={[styles.card, styles.halfCard]}>
                  <Text style={styles.cardTitle}>Sensor Tilt</Text>
                  <Text style={styles.label}>USE ACCELEROMETER</Text>
                  <View style={styles.toggleGroup}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, sensorModeEnabled && styles.toggleBtnActive]}
                      onPress={() => { setSensorModeEnabled(true); setDemoMode(false); }}
                    >
                      <Text style={[styles.toggleText, sensorModeEnabled && styles.toggleTextActive]}>ON</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleBtn, !sensorModeEnabled && styles.toggleBtnActive]}
                      onPress={() => { setSensorModeEnabled(false); setVirtualXOffset(0); setVirtualYOffset(0); sendJoystickCoords(0,0,true); }}
                    >
                      <Text style={[styles.toggleText, !sensorModeEnabled && styles.toggleTextActive]}>OFF</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Expressions */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Expressions</Text>
                <View style={styles.grid}>
                  {ANIMATIONS.map((anim) => (
                    <TouchableOpacity key={anim.id} style={styles.gridItem} onPress={() => triggerAnimation(anim.id)} activeOpacity={0.6}>
                      <Text style={styles.gridIcon}>{anim.icon}</Text>
                      <Text style={styles.gridName}>{anim.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* TAB 3: SETTINGS */}
          {activeTab === 'Settings' && (
            <View>
              {/* Sliders */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Dimensions Calibration</Text>
                
                <View style={styles.sliderWrap}>
                  <View style={styles.sliderHeader}>
                    <Text style={styles.label}>EYE WIDTH</Text>
                    <Text style={styles.valueText}>{eyeWidth}px</Text>
                  </View>
                  <Slider
                    style={styles.slider} minimumValue={20} maximumValue={60} step={1} value={eyeWidth}
                    onValueChange={setEyeWidth} onSlidingComplete={(val) => sendConfigUpdate(val, eyeHeight, cornerRadius)}
                    minimumTrackTintColor="#007AFF" maximumTrackTintColor="#E5E5EA" thumbTintColor="#FFFFFF"
                  />
                </View>

                <View style={styles.sliderWrap}>
                  <View style={styles.sliderHeader}>
                    <Text style={styles.label}>EYE HEIGHT</Text>
                    <Text style={styles.valueText}>{eyeHeight}px</Text>
                  </View>
                  <Slider
                    style={styles.slider} minimumValue={10} maximumValue={50} step={1} value={eyeHeight}
                    onValueChange={setEyeHeight} onSlidingComplete={(val) => sendConfigUpdate(eyeWidth, val, cornerRadius)}
                    minimumTrackTintColor="#007AFF" maximumTrackTintColor="#E5E5EA" thumbTintColor="#FFFFFF"
                  />
                </View>

                <View style={styles.sliderWrap}>
                  <View style={styles.sliderHeader}>
                    <Text style={styles.label}>ROUNDNESS</Text>
                    <Text style={styles.valueText}>{cornerRadius}px</Text>
                  </View>
                  <Slider
                    style={styles.slider} minimumValue={0} maximumValue={20} step={1} value={cornerRadius}
                    onValueChange={setCornerRadius} onSlidingComplete={(val) => sendConfigUpdate(eyeWidth, eyeHeight, val)}
                    minimumTrackTintColor="#007AFF" maximumTrackTintColor="#E5E5EA" thumbTintColor="#FFFFFF"
                  />
                </View>
              </View>
              
              <View style={styles.footer}>
                <Text style={styles.footerText}>Doovi's Eyes v2.1</Text>
              </View>
            </View>
          )}

        </ScrollView>

        {/* BOTTOM TAB BAR */}
        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('Dashboard')}>
            <Text style={[styles.tabIcon, activeTab === 'Dashboard' && styles.tabIconActive]}>🏠</Text>
            <Text style={[styles.tabLabel, activeTab === 'Dashboard' && styles.tabLabelActive]}>Dashboard</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('Control')}>
            <Text style={[styles.tabIcon, activeTab === 'Control' && styles.tabIconActive]}>🕹️</Text>
            <Text style={[styles.tabLabel, activeTab === 'Control' && styles.tabLabelActive]}>Control</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('Settings')}>
            <Text style={[styles.tabIcon, activeTab === 'Settings' && styles.tabIconActive]}>⚙️</Text>
            <Text style={[styles.tabLabel, activeTab === 'Settings' && styles.tabLabelActive]}>Settings</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginTop: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  halfCard: {
    flex: 1,
  },
  controlRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeConnected: {
    backgroundColor: '#E5F4EC',
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  statusDotConnecting: { backgroundColor: '#FF9500' },
  statusDotConnected: { backgroundColor: '#34C759' },
  statusText: {
    fontSize: 12, fontWeight: '600', color: '#8E8E93',
  },
  statusTextConnected: { color: '#248A3D' },
  inputContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    color: '#1C1C1E',
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 20,
    height: 48,
  },
  buttonConnect: { backgroundColor: '#007AFF' },
  buttonDisconnect: { backgroundColor: '#F2F2F7' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  buttonTextDisconnect: { color: '#FF3B30' },
  previewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  oledScreen: {
    width: 280,
    height: 130,
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  joystickAreaContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
  },
  joystickOuter: {
    width: 110,
    height: 110,
    backgroundColor: '#F2F2F7',
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  joystickInner: {
    width: 48,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
  },
  toggleTextActive: {
    color: '#1C1C1E',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  gridItem: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  gridName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  sliderWrap: {
    marginBottom: 20,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  valueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  footer: {
    alignItems: 'center',
    marginTop: 10,
  },
  footerText: {
    fontSize: 12,
    color: '#AEAEC0',
    fontWeight: '500',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingVertical: 10,
    paddingHorizontal: 20,
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 8,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 22,
    opacity: 0.4,
    marginBottom: 4,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#8E8E93',
  },
  tabLabelActive: {
    color: '#007AFF',
    fontWeight: '600',
  }
});
