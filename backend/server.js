import dotenv from 'dotenv';

dotenv.config();

// Imported after dotenv.config() so process.env is populated before app/db use it.
const { default: app } = await import('./src/app.js');
const { default: connectDB } = await import('./src/config/db.js');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
