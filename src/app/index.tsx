import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, FlatList, 
  TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, ScrollView
} from 'react-native';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebaseConfig'; 

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export default function Index() {
  // ================= STATE AUTENTIKASI =================
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false); // Loading saat tombol ditekan

  // ================= STATE DATA PROFIL =================
  const [profileName, setProfileName] = useState<string>('');
  const [profileWeight, setProfileWeight] = useState<string>('');
  const [profileHeight, setProfileHeight] = useState<string>('');
  const [targetCalories, setTargetCalories] = useState<string>('');

  // ================= STATE DATA MAKANAN =================
  const [tkpiDatabase, setTkpiDatabase] = useState<FoodItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredFoods, setFilteredFoods] = useState<FoodItem[]>([]);
  const [consumedFoods, setConsumedFoods] = useState<FoodItem[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');

  // ================= FUNGSI =================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        fetchFoodsFromDB();
        fetchUserProfile(currentUser.uid);
      }
    });
    return unsubscribe;
  }, []);

  // Menarik data profil dari Firestore
  const fetchUserProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfileName(data.name || '');
        setProfileWeight(data.weight?.toString() || '');
        setProfileHeight(data.height?.toString() || '');
        setTargetCalories(data.targetCalories?.toString() || '2000');
      }
    } catch (error) {
      console.error("Error mengambil profil: ", error);
    }
  };

  const fetchFoodsFromDB = async () => {
    setDataLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "makanan_tkpi"));
      const foodsData: FoodItem[] = []; 
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        foodsData.push({ 
          id: doc.id, 
          name: data.name || 'Tidak Diketahui', 
          calories: data.calories || 0,
          protein: data.protein || 0,
          fat: data.fat || 0,
          carbs: data.carbs || 0
        });
      });
      setTkpiDatabase(foodsData);
    } catch (error) {
      console.error("Error mengambil data makanan: ", error);
    } finally {
      setDataLoading(false);
    }
  };

  // Proses Login & Register Terpadu
  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Email dan Password wajib diisi!");
      return;
    }

    // Validasi ekstra khusus untuk mode pendaftaran (Register)
    if (!isLoginMode) {
      if (!profileName || !profileWeight || !profileHeight || !targetCalories) {
        Alert.alert("Error", "Harap lengkapi seluruh data diri Anda!");
        return;
      }
    }

    setIsProcessing(true);
    try {
      if (isLoginMode) {
        // Proses Login Biasa
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Proses Register: Buat Akun lalu simpan profil ke Firestore
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          name: profileName,
          weight: Number(profileWeight),
          height: Number(profileHeight),
          targetCalories: Number(targetCalories)
        });
        Alert.alert("Sukses", "Akun berhasil didaftarkan dan Anda langsung masuk!");
      }
      setEmail('');
      setPassword('');
      setActiveTab('home');
    } catch (error: any) {
      Alert.alert("Autentikasi Gagal", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setConsumedFoods([]); 
      setProfileName('');
      setProfileWeight('');
      setProfileHeight('');
      setTargetCalories('');
      setActiveTab('home');
    } catch (error) {
      console.error("Gagal logout: ", error);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text) {
      const newData = tkpiDatabase.filter((item: FoodItem) => {
        const itemData = item.name ? item.name.toUpperCase() : ''.toUpperCase();
        const textData = text.toUpperCase();
        return itemData.indexOf(textData) > -1;
      });
      setFilteredFoods(newData);
    } else {
      setFilteredFoods([]);
    }
  };

  const addFoodToLog = (food: FoodItem) => {
    setConsumedFoods([...consumedFoods, food]);
    setSearchQuery(''); 
    setFilteredFoods([]); 
  };

  const totalCalories = consumedFoods.reduce((total, item) => total + item.calories, 0);
  const totalProtein = consumedFoods.reduce((total, item) => total + item.protein, 0);
  const totalFat = consumedFoods.reduce((total, item) => total + item.fat, 0);
  const totalCarbs = consumedFoods.reduce((total, item) => total + item.carbs, 0);

  // ================= TAMPILAN (UI) =================

  if (authLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  // TAMPILAN 1: LAYAR LOGIN & REGISTER
  if (!user) {
    return (
      <SafeAreaView style={styles.authContainer}>
        {/* Menggunakan ScrollView agar form register tidak terpotong keyboard */}
        <ScrollView contentContainerStyle={styles.authScrollContent}>
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>
              {isLoginMode ? 'Masuk ke Akun' : 'Daftar Akun Baru'}
            </Text>
            
            <TextInput
              style={styles.authInput}
              placeholder="Email Mahasiswa"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.authInput}
              placeholder="Password (Min. 6 Karakter)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {/* Kolom Tambahan Khusus Untuk Mode Register */}
            {!isLoginMode && (
              <View style={styles.registerFieldsContainer}>
                <View style={styles.divider} />
                <Text style={styles.subtitleText}>Informasi Profil</Text>
                
                <TextInput
                  style={styles.authInput}
                  placeholder="Nama Lengkap"
                  value={profileName}
                  onChangeText={setProfileName}
                />
                
                <View style={styles.rowInputs}>
                  <TextInput
                    style={[styles.authInput, { flex: 1, marginRight: 8 }]}
                    placeholder="Berat (kg)"
                    value={profileWeight}
                    onChangeText={setProfileWeight}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.authInput, { flex: 1, marginLeft: 8 }]}
                    placeholder="Tinggi (cm)"
                    value={profileHeight}
                    onChangeText={setProfileHeight}
                    keyboardType="numeric"
                  />
                </View>
                
                <TextInput
                  style={styles.authInput}
                  placeholder="Target Kalori Harian (Misal: 2000)"
                  value={targetCalories}
                  onChangeText={setTargetCalories}
                  keyboardType="numeric"
                />
              </View>
            )}
            
            <TouchableOpacity 
              style={styles.authButton} 
              onPress={handleAuth}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.authButtonText}>{isLoginMode ? 'Masuk' : 'Daftar & Simpan'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)}>
              <Text style={styles.authSwitchText}>
                {isLoginMode ? 'Belum punya akun? Daftar di sini' : 'Sudah punya akun? Masuk di sini'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // TAMPILAN 2: APLIKASI UTAMA (BERANDA & PROFIL)
  return (
    <SafeAreaView style={styles.container}>
      {activeTab === 'home' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>Halo, {profileName || 'Mahasiswa'}!</Text>
            
            <View style={{flexDirection: 'row', alignItems: 'baseline', marginBottom: 16}}>
              <Text style={styles.calorieText}>{totalCalories}</Text>
              <Text style={styles.targetText}> / {targetCalories} kcal</Text>
            </View>
            
            <View style={styles.macroContainer}>
              <View style={styles.macroItem}>
                <Text style={styles.macroLabel}>Protein</Text>
                <Text style={styles.macroValue}>{totalProtein.toFixed(1)}g</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroLabel}>Lemak</Text>
                <Text style={styles.macroValue}>{totalFat.toFixed(1)}g</Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={styles.macroLabel}>Karbo</Text>
                <Text style={styles.macroValue}>{totalCarbs.toFixed(1)}g</Text>
              </View>
            </View>
          </View>

          {dataLoading ? (
            <ActivityIndicator size="small" color="#4CAF50" style={{ marginTop: 20 }} />
          ) : (
            <>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cari makanan lokal (Contoh: Nasi)"
                  value={searchQuery}
                  onChangeText={handleSearch}
                />
              </View>

              {filteredFoods.length > 0 && (
                <View style={styles.listContainer}>
                  <Text style={styles.sectionTitle}>Hasil Pencarian:</Text>
                  <FlatList
                    data={filteredFoods}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.foodItem} onPress={() => addFoodToLog(item)}>
                        <View style={styles.foodTextContainer}>
                          <Text style={styles.foodName}>{item.name}</Text>
                          <Text style={styles.foodDetail}>
                            {item.calories} kcal • P: {item.protein}g • L: {item.fat}g • K: {item.carbs}g
                          </Text>
                        </View>
                        <Text style={styles.addButton}>+</Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}

              <View style={[styles.listContainer, { flex: 1 }]}>
                <Text style={styles.sectionTitle}>Riwayat Makan Hari Ini:</Text>
                {consumedFoods.length === 0 ? (
                  <Text style={styles.emptyText}>Belum ada makanan yang dicatat.</Text>
                ) : (
                  <FlatList
                    data={consumedFoods}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={({ item }) => (
                      <View style={styles.foodItem}>
                        <View style={styles.foodTextContainer}>
                          <Text style={styles.foodName}>{item.name}</Text>
                          <Text style={styles.foodDetail}>
                            {item.calories} kcal • P: {item.protein}g • L: {item.fat}g • K: {item.carbs}g
                          </Text>
                        </View>
                      </View>
                    )}
                  />
                )}
              </View>
            </>
          )}
        </View>
      ) : (
        /* KONTEN PROFIL BERSIH (HANYA BACA) */
        <ScrollView style={styles.profileContainer}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {profileName ? profileName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.profileNameTitle}>{profileName}</Text>
            <Text style={styles.profileEmail}>{user.email}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Data Diri Pengguna</Text>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Berat Badan</Text>
              <Text style={styles.infoValue}>{profileWeight} kg</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tinggi Badan</Text>
              <Text style={styles.infoValue}>{profileHeight} cm</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Target Kalori Harian</Text>
              <Text style={styles.infoValue}>{targetCalories} kcal</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutButtonProfile} onPress={handleLogout}>
            <Text style={styles.logoutTextProfile}>Keluar (Logout)</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* BOTTOM NAVIGATION BAR */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('home')}>
          <Text style={[styles.navText, activeTab === 'home' && styles.navTextActive]}>Beranda</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('profile')}>
          <Text style={[styles.navText, activeTab === 'profile' && styles.navTextActive]}>Profil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ================= STYLES =================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', paddingTop: 40 },
  
  // Auth Styles
  authContainer: { flex: 1, backgroundColor: '#4CAF50' },
  authScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  authCard: { width: '85%', backgroundColor: '#FFF', padding: 24, borderRadius: 12, elevation: 5 },
  authTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 20, textAlign: 'center' },
  authInput: { backgroundColor: '#F5F7FA', padding: 14, borderRadius: 8, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E0E0E0' },
  authButton: { backgroundColor: '#4CAF50', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  authButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  authSwitchText: { color: '#4CAF50', marginTop: 15, textAlign: 'center', fontWeight: '500' },
  registerFieldsContainer: { marginTop: 5 },
  divider: { height: 1, backgroundColor: '#EEE', marginVertical: 15 },
  subtitleText: { fontSize: 14, fontWeight: 'bold', color: '#666', marginBottom: 10, textAlign: 'center' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },

  // Home Styles
  headerCard: { backgroundColor: '#4CAF50', padding: 20, margin: 16, borderRadius: 12, elevation: 3 },
  headerTitle: { color: '#E8F5E9', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  calorieText: { color: '#FFF', fontSize: 40, fontWeight: 'bold' },
  targetText: { color: '#E8F5E9', fontSize: 18, fontWeight: '500' },
  macroContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 8 },
  macroItem: { alignItems: 'center' },
  macroLabel: { color: '#E8F5E9', fontSize: 12, marginBottom: 2 },
  macroValue: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  searchContainer: { paddingHorizontal: 16, marginBottom: 10 },
  searchInput: { backgroundColor: '#FFF', padding: 14, borderRadius: 8, fontSize: 16, borderWidth: 1, borderColor: '#E0E0E0' },
  listContainer: { paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  foodItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  foodTextContainer: { flex: 1 },
  foodName: { fontSize: 16, fontWeight: '600', color: '#333' },
  foodDetail: { fontSize: 13, color: '#666', marginTop: 6 },
  addButton: { fontSize: 28, color: '#4CAF50', fontWeight: 'bold', paddingHorizontal: 10 },
  emptyText: { color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },

  // Profile Styles (Read Only)
  profileContainer: { flex: 1, padding: 20 },
  profileHeader: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  avatarText: { color: '#FFF', fontSize: 32, fontWeight: 'bold' },
  profileNameTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  profileEmail: { fontSize: 14, color: '#666', marginTop: 5 },
  infoCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 20 },
  infoCardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' },
  infoLabel: { fontSize: 14, color: '#666' },
  infoValue: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  logoutButtonProfile: { backgroundColor: '#FF3B30', padding: 15, borderRadius: 8, alignItems: 'center' },
  logoutTextProfile: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

  // Bottom Navigation Styles
  bottomNav: { flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E0E0E0', paddingBottom: 10, paddingTop: 10 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  navText: { fontSize: 16, color: '#999', fontWeight: '500' },
  navTextActive: { color: '#4CAF50', fontWeight: 'bold' }
});