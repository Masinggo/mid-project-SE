import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, FlatList, 
  TouchableOpacity, SafeAreaView, ActivityIndicator 
} from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../src/app/firebaseConfig'; 

export default function App() {
  const [tkpiDatabase, setTkpiDatabase] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFoods, setFilteredFoods] = useState([]);
  const [consumedFoods, setConsumedFoods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFoodsFromDB = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "makanan_tkpi"));
        const foodsData = [];
        querySnapshot.forEach((doc) => {
          foodsData.push({ id: doc.id, ...doc.data() });
        });
        setTkpiDatabase(foodsData);
        setLoading(false);
      } catch (error) {
        console.error("Error dari Firebase: ", error);
        setLoading(false);
      }
    };
    fetchFoodsFromDB();
  }, []); 

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (text) {
      const newData = tkpiDatabase.filter(item => {
        const itemData = item.name ? item.name.toUpperCase() : ''.toUpperCase();
        const textData = text.toUpperCase();
        return itemData.indexOf(textData) > -1;
      });
      setFilteredFoods(newData);
    } else {
      setFilteredFoods([]);
    }
  };

  const addFoodToLog = (food) => {
    setConsumedFoods([...consumedFoods, food]);
    setSearchQuery(''); 
    setFilteredFoods([]); 
    alert(`${food.name} berhasil ditambahkan!`);
  };

  const totalCalories = consumedFoods.reduce((total, item) => total + item.calories, 0);

  // Tampilan saat sedang mengambil data
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ marginTop: 10, fontSize: 16 }}>Mengambil data TKPI dari Server...</Text>
      </View>
    );
  }

  // Tampilan utama aplikasi
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Pemantau Kalori Mahasiswa</Text>
        <Text style={styles.calorieText}>{totalCalories} kcal</Text>
        <Text style={styles.subText}>Total Kalori Hari Ini</Text>
      </View>

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
                <View>
                  <Text style={styles.foodName}>{item.name}</Text>
                  <Text style={styles.foodDetail}>{item.calories} kcal</Text>
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
                <Text style={styles.foodName}>{item.name}</Text>
                <Text style={styles.foodDetail}>{item.calories} kcal</Text>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// Desain (StyleSheet) Lengkap
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    paddingTop: 40,
  },
  headerCard: {
    backgroundColor: '#4CAF50',
    padding: 20,
    margin: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  calorieText: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: 'bold',
  },
  subText: {
    color: '#E8F5E9',
    fontSize: 14,
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  listContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  foodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  foodName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  foodDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  addButton: {
    fontSize: 24,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  }
});