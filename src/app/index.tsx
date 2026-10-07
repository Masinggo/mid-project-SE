import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, FlatList, 
  TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, ScrollView, Modal
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

// --- INTERFACE DATA ---
export interface FoodItem {
  id: string;
  name: string;
  kategori: string;
  protein_100g: number;
  fat_100g: number;
  carbs_100g: number;
}

export interface ConsumedItem {
  id: string;
  name: string;
  portion: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export default function Index() {
  // ================= STATE AUTENTIKASI (TETAP SAMA) =================
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false); 

  // ================= STATE DATA PROFIL (TETAP SAMA) =================
  const [profileName, setProfileName] = useState<string>('');
  const [profileWeight, setProfileWeight] = useState<string>('');
  const [profileHeight, setProfileHeight] = useState<string>('');
  const [targetCalories, setTargetCalories] = useState<string>('');

  // ================= STATE DATA MAKANAN & ALUR BARU =================
  const [tkpiDatabase, setTkpiDatabase] = useState<FoodItem[]>([]);
  const [consumedFoods, setConsumedFoods] = useState<ConsumedItem[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');

  // Kategori & Pencarian (Sesuai PPT)
  const categoriesList = ['Semua', 'Makanan Pokok', 'Lauk Pauk', 'Sayur', 'Buah', 'Minuman', 'Jajanan'];
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Modal Input Porsi (Sesuai PPT)
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [activeFood, setActiveFood] = useState<FoodItem | null>(null);
  const [portionInput, setPortionInput] = useState<string>('100'); // Default 100 gram

  // ================= FUNGSI AUTENTIKASI (TETAP SAMA) =================
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

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Email dan Password wajib diisi!");
      return;
    }
    if (!isLoginMode) {
      if (!profileName || !profileWeight || !profileHeight || !targetCalories) {
        Alert.alert("Error", "Harap lengkapi seluruh data diri Anda!");
        return;
      }
    }

    setIsProcessing(true);
    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          name: profileName,
          weight: Number(profileWeight),
          height: Number(profileHeight),
          targetCalories: Number(targetCalories)
        });
        Alert.alert("Sukses", "Akun berhasil didaftarkan dan Anda langsung masuk!");
      }
      setEmail(''); setPassword(''); setActiveTab('home');
    } catch (error: any) {
      Alert.alert("Autentikasi Gagal", error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setConsumedFoods([]); setProfileName(''); setProfileWeight('');
      setProfileHeight(''); setTargetCalories(''); setActiveTab('home');
    } catch (error) {
      console.error("Gagal logout: ", error);
    }
  };

  // ================= FUNGSI ALUR APLIKASI BARU (SESUAI PPT) =================
  
  // 1. Ambil data dari Firebase (Asumsi nilai di DB adalah per 100g)
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
          kategori: data.kategori || 'Lainnya', // Kolom kategori dari DB
          protein_100g: data.protein || 0,
          fat_100g: data.fat || 0,
          carbs_100g: data.carbs || 0
        });
      });
      setTkpiDatabase(foodsData);
    } catch (error) {
      console.error("Error mengambil data makanan: ", error);
    } finally {
      setDataLoading(false);
    }
  };

  // 2. Filter berdasarkan Kategori DAN Pencarian Teks
  const filteredFoods = tkpiDatabase.filter((item) => {
    const matchesCategory = selectedCategory === 'Semua' || item.kategori === selectedCategory;
    const matchesSearch = item.name.toUpperCase().includes(searchQuery.toUpperCase());
    return matchesCategory && matchesSearch;
  });

  // 3. Saat makanan diklik (Buka modal input porsi)
  const openPortionModal = (food: FoodItem) => {
    setActiveFood(food);
    setPortionInput('100'); // Reset ke 100g tiap pilih makanan baru
    setModalVisible(true);
  };

  // 4. Hitung gizi sesuai rumus di PPT & Simpan ke riwayat
  const handleSaveToHistory = () => {
    if (!activeFood) return;
    
    const gram = Number(portionInput);
    if (isNaN(gram) || gram <= 0) {
      Alert.alert("Input Salah", "Masukkan jumlah porsi yang valid (lebih dari 0).");
      return;
    }

    // Rumus: (nilai per 100g / 100) x porsi(gram)
    const calcProtein = (activeFood.protein_100g / 100) * gram;
    const calcFat = (activeFood.fat_100g / 100) * gram;
    const calcCarbs = (activeFood.carbs_100g / 100) * gram;
    
    // Rumus Kalori = (4xProtein) + (9xLemak) + (4xKarbo)
    const calcCalories = (4 * calcProtein) + (9 * calcFat) + (4 * calcCarbs);

    const newConsumedItem: ConsumedItem = {
      id: Math.random().toString(), // ID unik untuk riwayat
      name: activeFood.name,
      portion: gram,
      protein: calcProtein,
      fat: calcFat,
      carbs: calcCarbs,
      calories: calcCalories
    };

    setConsumedFoods([...consumedFoods, newConsumedItem]);
    setModalVisible(false);
    setActiveFood(null);
    setSearchQuery('');
  };

  // 5. Total Harian (Riwayat)
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

  // TAMPILAN 1: LAYAR LOGIN & REGISTER (TETAP SAMA)
  if (!user) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <ScrollView contentContainerStyle={styles.authScrollContent}>
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>{isLoginMode ? 'Masuk ke Akun' : 'Daftar Akun Baru'}</Text>
            <TextInput style={styles.authInput} placeholder="Email Mahasiswa" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.authInput} placeholder="Password (Min. 6 Karakter)" value={password} onChangeText={setPassword} secureTextEntry />
            {!isLoginMode && (
              <View style={styles.registerFieldsContainer}>
                <View style={styles.divider} />
                <Text style={styles.subtitleText}>Informasi Profil</Text>
                <TextInput style={styles.authInput} placeholder="Nama Lengkap" value={profileName} onChangeText={setProfileName} />
                <View style={styles.rowInputs}>
                  <TextInput style={[styles.authInput, { flex: 1, marginRight: 8 }]} placeholder="Berat (kg)" value={profileWeight} onChangeText={setProfileWeight} keyboardType="numeric" />
                  <TextInput style={[styles.authInput, { flex: 1, marginLeft: 8 }]} placeholder="Tinggi (cm)" value={profileHeight} onChangeText={setProfileHeight} keyboardType="numeric" />
                </View>
                <TextInput style={styles.authInput} placeholder="Target Kalori (Misal: 2000)" value={targetCalories} onChangeText={setTargetCalories} keyboardType="numeric" />
              </View>
            )}
            <TouchableOpacity style={styles.authButton} onPress={handleAuth} disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.authButtonText}>{isLoginMode ? 'Masuk' : 'Daftar & Simpan'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)}>
              <Text style={styles.authSwitchText}>{isLoginMode ? 'Belum punya akun? Daftar di sini' : 'Sudah punya akun? Masuk di sini'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // TAMPILAN 2: APLIKASI UTAMA
  return (
    <SafeAreaView style={styles.container}>
      {activeTab === 'home' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>Halo, {profileName || 'Mahasiswa'}!</Text>
            <View style={{flexDirection: 'row', alignItems: 'baseline', marginBottom: 16}}>
              <Text style={styles.calorieText}>{totalCalories.toFixed(0)}</Text>
              <Text style={styles.targetText}> / {targetCalories} kcal</Text>
            </View>
            <View style={styles.macroContainer}>
              <View style={styles.macroItem}><Text style={styles.macroLabel}>Protein</Text><Text style={styles.macroValue}>{totalProtein.toFixed(1)}g</Text></View>
              <View style={styles.macroItem}><Text style={styles.macroLabel}>Lemak</Text><Text style={styles.macroValue}>{totalFat.toFixed(1)}g</Text></View>
              <View style={styles.macroItem}><Text style={styles.macroLabel}>Karbo</Text><Text style={styles.macroValue}>{totalCarbs.toFixed(1)}g</Text></View>
            </View>
          </View>

          {/* === ALUR 1: PILIH KATEGORI === */}
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={{paddingHorizontal: 16}}>
              {categoriesList.map((cat, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={[styles.categoryBadge, selectedCategory === cat && styles.categoryBadgeActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* === ALUR 2: PILIH MAKANAN === */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={`Cari makanan di ${selectedCategory}...`}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {dataLoading ? (
             <ActivityIndicator size="small" color="#4CAF50" style={{ marginTop: 20 }} />
          ) : (
             <ScrollView style={{flex: 1, paddingHorizontal: 16}}>
               {/* Daftar Hasil Pencarian */}
               {filteredFoods.length > 0 ? (
                  <View style={{marginBottom: 20}}>
                    <Text style={styles.sectionTitle}>Daftar Makanan (per 100g):</Text>
                    {filteredFoods.map((item) => (
                      <TouchableOpacity key={item.id} style={styles.foodItem} onPress={() => openPortionModal(item)}>
                        <View style={styles.foodTextContainer}>
                          <Text style={styles.foodName}>{item.name}</Text>
                          <Text style={styles.foodDetail}>
                            P: {item.protein_100g}g • L: {item.fat_100g}g • K: {item.carbs_100g}g
                          </Text>
                        </View>
                        <Text style={styles.addButton}>+</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
               ) : (
                 <Text style={styles.emptyText}>Tidak ada makanan ditemukan.</Text>
               )}

               {/* === ALUR 5: SIMPAN RIWAYAT & LIHAT TOTAL === */}
               <View style={{marginBottom: 20}}>
                  <Text style={styles.sectionTitle}>Riwayat Makan Hari Ini:</Text>
                  {consumedFoods.length === 0 ? (
                    <Text style={styles.emptyText}>Belum ada makanan yang dicatat.</Text>
                  ) : (
                    consumedFoods.map((item) => (
                      <View key={item.id} style={styles.foodItem}>
                        <View style={styles.foodTextContainer}>
                          <Text style={styles.foodName}>{item.name} ({item.portion}g)</Text>
                          <Text style={styles.foodDetail}>
                            {item.calories.toFixed(1)} kcal • P: {item.protein.toFixed(1)}g • L: {item.fat.toFixed(1)}g • K: {item.carbs.toFixed(1)}g
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
               </View>
             </ScrollView>
          )}

          {/* === ALUR 3 & 4: MODAL INPUT PORSI & HITUNG === */}
          <Modal visible={modalVisible} transparent={true} animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Berapa porsi yang dimakan?</Text>
                <Text style={styles.modalSubTitle}>{activeFood?.name}</Text>
                
                <View style={styles.modalInputRow}>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={portionInput}
                    onChangeText={setPortionInput}
                  />
                  <Text style={styles.modalInputUnit}>gram</Text>
                </View>

                {/* Simulasi Live Perhitungan di Modal */}
                <View style={styles.modalResultBox}>
                  <Text style={styles.modalResultText}>
                    Estimasi Kalori: {activeFood && portionInput ? 
                      ((4 * ((activeFood.protein_100g/100)*Number(portionInput))) + 
                       (9 * ((activeFood.fat_100g/100)*Number(portionInput))) + 
                       (4 * ((activeFood.carbs_100g/100)*Number(portionInput)))).toFixed(1) 
                      : 0} kcal
                  </Text>
                </View>

                <View style={styles.modalActionRow}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                    <Text style={styles.modalBtnCancelText}>Batal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnSave} onPress={handleSaveToHistory}>
                    <Text style={styles.modalBtnSaveText}>Simpan Riwayat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

        </View>
      ) : (
        /* KONTEN PROFIL (TETAP SAMA) */
        <ScrollView style={styles.profileContainer}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarCircle}><Text style={styles.avatarText}>{profileName ? profileName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}</Text></View>
            <Text style={styles.profileNameTitle}>{profileName}</Text>
            <Text style={styles.profileEmail}>{user.email}</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Data Diri Pengguna</Text>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Berat Badan</Text><Text style={styles.infoValue}>{profileWeight} kg</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Tinggi Badan</Text><Text style={styles.infoValue}>{profileHeight} cm</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>Target Kalori Harian</Text><Text style={styles.infoValue}>{targetCalories} kcal</Text></View>
          </View>
          <TouchableOpacity style={styles.logoutButtonProfile} onPress={handleLogout}>
            <Text style={styles.logoutTextProfile}>Keluar (Logout)</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* BOTTOM NAV */}
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

  headerCard: { backgroundColor: '#4CAF50', padding: 20, margin: 16, borderRadius: 12, elevation: 3 },
  headerTitle: { color: '#E8F5E9', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  calorieText: { color: '#FFF', fontSize: 40, fontWeight: 'bold' },
  targetText: { color: '#E8F5E9', fontSize: 18, fontWeight: '500' },
  macroContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 8 },
  macroItem: { alignItems: 'center' },
  macroLabel: { color: '#E8F5E9', fontSize: 12, marginBottom: 2 },
  macroValue: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  
  // Styles Kategori & Search
  categoryScroll: { maxHeight: 50, marginBottom: 10 },
  categoryBadge: { backgroundColor: '#E0E0E0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10, height: 36, justifyContent: 'center' },
  categoryBadgeActive: { backgroundColor: '#4CAF50' },
  categoryText: { color: '#666', fontWeight: '600', fontSize: 14 },
  categoryTextActive: { color: '#FFF' },
  searchContainer: { paddingHorizontal: 16, marginBottom: 10 },
  searchInput: { backgroundColor: '#FFF', padding: 14, borderRadius: 8, fontSize: 16, borderWidth: 1, borderColor: '#E0E0E0' },
  
  // List Styles
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  foodItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  foodTextContainer: { flex: 1 },
  foodName: { fontSize: 16, fontWeight: '600', color: '#333' },
  foodDetail: { fontSize: 13, color: '#666', marginTop: 6 },
  addButton: { fontSize: 24, color: '#4CAF50', fontWeight: 'bold', paddingHorizontal: 10 },
  emptyText: { color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },

  // Modal Styles (Input Porsi)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '80%', backgroundColor: '#FFF', borderRadius: 12, padding: 24, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  modalSubTitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20, marginTop: 5 },
  modalInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  modalInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, fontSize: 20, padding: 10, width: 100, textAlign: 'center', fontWeight: 'bold' },
  modalInputUnit: { fontSize: 18, color: '#666', marginLeft: 10, fontWeight: '500' },
  modalResultBox: { backgroundColor: '#F5F7FA', padding: 12, borderRadius: 8, marginBottom: 20, alignItems: 'center' },
  modalResultText: { fontSize: 16, fontWeight: '600', color: '#4CAF50' },
  modalActionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtnCancel: { flex: 1, padding: 12, backgroundColor: '#E0E0E0', borderRadius: 8, marginRight: 5, alignItems: 'center' },
  modalBtnCancelText: { color: '#333', fontWeight: 'bold' },
  modalBtnSave: { flex: 1, padding: 12, backgroundColor: '#4CAF50', borderRadius: 8, marginLeft: 5, alignItems: 'center' },
  modalBtnSaveText: { color: '#FFF', fontWeight: 'bold' },

  // Profile & Nav
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
  bottomNav: { flexDirection: 'row', backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E0E0E0', paddingBottom: 10, paddingTop: 10 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  navText: { fontSize: 16, color: '#999', fontWeight: '500' },
  navTextActive: { color: '#4CAF50', fontWeight: 'bold' }
});