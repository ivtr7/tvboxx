import { db } from '../config/database.js';

async function debugDevices() {
  try {
    console.log('🔍 Verificando dispositivos no banco de dados...');
    
    // Verificar todos os dispositivos
    const [allDevices] = await db.execute('SELECT * FROM devices');
    console.log(`\n📱 Total de dispositivos no banco: ${allDevices.length}`);
    
    allDevices.forEach(device => {
      console.log(`  - ID: ${device.id}, Device_ID: ${device.device_id}, Nome: ${device.name}, Tenant: ${device.tenant_id}`);
    });
    
    // Verificar usuários
    const [allUsers] = await db.execute('SELECT id, email, tenant_id FROM users');
    console.log(`\n👥 Total de usuários no banco: ${allUsers.length}`);
    
    allUsers.forEach(user => {
      console.log(`  - ID: ${user.id}, Email: ${user.email}, Tenant: ${user.tenant_id}`);
    });
    
    // Testar consulta específica
    console.log('\n🧪 Testando consulta de dispositivos por tenant...');
    
    const [devicesA] = await db.execute(
      'SELECT device_id, name, location, status, last_seen, created_at FROM devices WHERE tenant_id = ? ORDER BY created_at DESC',
      ['tenant_a']
    );
    console.log(`Dispositivos para tenant_a: ${devicesA.length}`);
    
    const [devicesB] = await db.execute(
      'SELECT device_id, name, location, status, last_seen, created_at FROM devices WHERE tenant_id = ? ORDER BY created_at DESC',
      ['tenant_b']
    );
    console.log(`Dispositivos para tenant_b: ${devicesB.length}`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    process.exit(0);
  }
}

debugDevices();