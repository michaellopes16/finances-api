import axios from 'axios';

export const api = axios.create({
  // URL do nosso backend local (quando formos para a nuvem, mudaremos apenas aqui)
  baseURL: 'http://localhost:3333', 
});