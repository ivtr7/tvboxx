import axios from 'axios';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = 'http://localhost:3001/api';

// Função para fazer login e obter token
async function login(email, password) {
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password
    });
    return response.data.token;
  } catch (error) {
    console.error('Erro no login:', error.response?.data || error.message);
    return null;
  }
}

// Função para criar usuários de teste
async function createTestUsers() {
  try {
    const passwordHash = await bcrypt.hash('test123', 10);
    
    // Usuário do tenant A
    await db.execute(
      `INSERT IGNORE INTO users (username, email, password, name, role, tenant_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['user_a', 'user_a@test.com', passwordHash, 'User A', 'user', 'tenant_a']
    );
    
    // Usuário do tenant B
    await db.execute(
      `INSERT IGNORE INTO users (username, email, password, name, role, tenant_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['user_b', 'user_b@test.com', passwordHash, 'User B', 'user', 'tenant_b']
    );
    
    console.log('✅ Usuários de teste criados');
  } catch (error) {
    console.error('❌ Erro ao criar usuários:', error);
  }
}

// Função para criar dispositivos de teste
async function createTestDevices() {
  try {
    // Dispositivos do tenant A
    await db.execute(
      `INSERT IGNORE INTO devices (device_id, name, location, status, tenant_id, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['device_a1', 'TV Sala A1', 'Loja A - Sala 1', 'online', 'tenant_a', '192.168.1.10']
    );
    
    await db.execute(
      `INSERT IGNORE INTO devices (device_id, name, location, status, tenant_id, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['device_a2', 'TV Sala A2', 'Loja A - Sala 2', 'offline', 'tenant_a', '192.168.1.11']
    );
    
    // Dispositivos do tenant B
    await db.execute(
      `INSERT IGNORE INTO devices (device_id, name, location, status, tenant_id, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['device_b1', 'TV Recepção B', 'Loja B - Recepção', 'online', 'tenant_b', '192.168.2.10']
    );
    
    await db.execute(
      `INSERT IGNORE INTO devices (device_id, name, location, status, tenant_id, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['device_b2', 'TV Vitrine B', 'Loja B - Vitrine', 'maintenance', 'tenant_b', '192.168.2.11']
    );
    
    console.log('✅ Dispositivos de teste criados');
  } catch (error) {
    console.error('❌ Erro ao criar dispositivos:', error);
  }
}

// Função para testar isolamento de dispositivos
async function testDeviceIsolation() {
  console.log('\n🧪 Testando isolamento de dispositivos...');
  
  // Login dos usuários
  const tokenA = await login('user_a@test.com', 'test123');
  const tokenB = await login('user_b@test.com', 'test123');
  
  if (!tokenA || !tokenB) {
    console.error('❌ Falha no login dos usuários de teste');
    return;
  }
  
  try {
    // Usuário A tenta acessar seus dispositivos
    const devicesA = await axios.get(`${API_BASE}/devices`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    
    console.log(`\n👤 Usuário A (tenant_a) vê ${devicesA.data.length} dispositivos:`);
    devicesA.data.forEach(device => {
      console.log(`  - ${device.name} (${device.id}) - Tenant: ${device.tenant_id}`);
    });
    
    // Usuário B tenta acessar seus dispositivos
    const devicesB = await axios.get(`${API_BASE}/devices`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    
    console.log(`\n👤 Usuário B (tenant_b) vê ${devicesB.data.length} dispositivos:`);
    devicesB.data.forEach(device => {
      console.log(`  - ${device.name} (${device.id}) - Tenant: ${device.tenant_id}`);
    });
    
    // Verificar se há isolamento correto
    const tenantADevices = devicesA.data.filter(d => d.tenant_id === 'tenant_a');
    const tenantBDevices = devicesB.data.filter(d => d.tenant_id === 'tenant_b');
    const crossContamination = [
      ...devicesA.data.filter(d => d.tenant_id !== 'tenant_a'),
      ...devicesB.data.filter(d => d.tenant_id !== 'tenant_b')
    ];
    
    console.log('\n📊 Resultados do teste:');
    console.log(`✅ Usuário A vê apenas dispositivos do tenant_a: ${tenantADevices.length === devicesA.data.length}`);
    console.log(`✅ Usuário B vê apenas dispositivos do tenant_b: ${tenantBDevices.length === devicesB.data.length}`);
    console.log(`✅ Sem contaminação cruzada: ${crossContamination.length === 0}`);
    
    if (crossContamination.length > 0) {
      console.log('❌ Dispositivos com contaminação cruzada:');
      crossContamination.forEach(device => {
        console.log(`  - ${device.name} (${device.id}) - Tenant: ${device.tenant_id}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  }
}

// Função principal
async function runTests() {
  console.log('🚀 Iniciando testes de isolamento de inquilinos...');
  
  await createTestUsers();
  await createTestDevices();
  await testDeviceIsolation();
  
  console.log('\n✅ Testes concluídos!');
  process.exit(0);
}

runTests().catch(error => {
  console.error('❌ Erro nos testes:', error);
  process.exit(1);
});