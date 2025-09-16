import axios from 'axios';
import { db } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = 'http://localhost:3001/api';

// Função para fazer login e obter token
async function login(email, password) {
  try {
    console.log(`🔐 Tentando login com: ${email}`);
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password
    });
    console.log(`✅ Login bem-sucedido para: ${email}`);
    return response.data.token;
  } catch (error) {
    console.error(`❌ Erro no login para ${email}:`, error.response?.data || error.message);
    return null;
  }
}

// Função para testar API de dispositivos
async function testDevicesAPI(token, userEmail) {
  try {
    console.log(`\n📱 Testando API de dispositivos para: ${userEmail}`);
    const response = await axios.get(`${API_BASE}/devices`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`✅ Resposta recebida: ${response.data.length} dispositivos`);
    response.data.forEach((device, index) => {
      console.log(`  ${index + 1}. ${device.nome} (${device.id}) - Status: ${device.status}`);
    });
    
    return response.data;
  } catch (error) {
    console.error(`❌ Erro na API de dispositivos:`, error.response?.data || error.message);
    return [];
  }
}

// Função principal
async function runAPITest() {
  console.log('🚀 Iniciando teste direto da API...');
  
  // Testar login e API para usuário A
  console.log('\n=== TESTE USUÁRIO A (tenant_a) ===');
  const tokenA = await login('user_a@test.com', 'test123');
  if (tokenA) {
    await testDevicesAPI(tokenA, 'user_a@test.com');
  }
  
  // Testar login e API para usuário B
  console.log('\n=== TESTE USUÁRIO B (tenant_b) ===');
  const tokenB = await login('user_b@test.com', 'test123');
  if (tokenB) {
    await testDevicesAPI(tokenB, 'user_b@test.com');
  }
  
  // Testar com usuário admin
  console.log('\n=== TESTE USUÁRIO ADMIN (default) ===');
  const tokenAdmin = await login('admin@oricontrol.com', 'admin123');
  if (tokenAdmin) {
    await testDevicesAPI(tokenAdmin, 'admin@oricontrol.com');
  }
  
  console.log('\n✅ Teste da API concluído!');
  process.exit(0);
}

runAPITest().catch(error => {
  console.error('❌ Erro no teste:', error);
  process.exit(1);
});