import axios from 'axios';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = 'http://localhost:3001/api';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Função para fazer login e analisar token
async function loginAndAnalyzeToken(email, password) {
  try {
    console.log(`\n🔐 Fazendo login com: ${email}`);
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password
    });
    
    const token = response.data.token;
    console.log(`✅ Token recebido: ${token.substring(0, 50)}...`);
    
    // Decodificar token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('📋 Conteúdo do token:');
    console.log(JSON.stringify(decoded, null, 2));
    
    // Testar endpoint /me para verificar dados do usuário
    console.log('\n👤 Testando endpoint /me...');
    const meResponse = await axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('📋 Dados do usuário:');
    console.log(JSON.stringify(meResponse.data, null, 2));
    
    return { token, decoded, userData: meResponse.data };
    
  } catch (error) {
    console.error(`❌ Erro para ${email}:`, error.response?.data || error.message);
    return null;
  }
}

// Função principal
async function debugJWT() {
  console.log('🔍 Analisando tokens JWT...');
  
  // Testar usuários de teste
  await loginAndAnalyzeToken('user_a@test.com', 'test123');
  await loginAndAnalyzeToken('user_b@test.com', 'test123');
  
  console.log('\n✅ Análise de JWT concluída!');
  process.exit(0);
}

debugJWT().catch(error => {
  console.error('❌ Erro na análise:', error);
  process.exit(1);
});