import { initializeApp } from '@firebase/app';
import { getAuth } from '@firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAR6nB36rk70pybUU90Zuw0ydtCSw2gPeo',
  authDomain: 'campuspulse-820aa.firebaseapp.com',
  projectId: 'campuspulse-820aa',
  storageBucket: 'campuspulse-820aa.firebasestorage.app',
  messagingSenderId: '1056252483155',
  appId: '1:1056252483155:web:2ef0843ca070ec53bd18a6',
  measurementId: 'G-K7N8T5PW3R'
};

export const firebaseAuth = getAuth(initializeApp(firebaseConfig));
