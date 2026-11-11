import { createApp } from './app';

const port = Number(process.env.PORT || 4000);

let uri = process.env.MONGODB_URI;
if (!uri) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta MONGODB_URI.');
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const memory = await MongoMemoryServer.create();
  uri = memory.getUri();
  console.log('Sin MONGODB_URI: la base es temporal y se borra al apagar este proceso.');
}

const app = await createApp(uri);
app.listen(port, () => {
  console.log(`Servidor listo en http://127.0.0.1:${port}`);
});
