const DEFAULT_TEST_URI = 'mongodb://127.0.0.1:27017/research_platform_test';

const getTestDatabaseUri = () => {
  if (process.env.TEST_MONGODB_URI) return process.env.TEST_MONGODB_URI;

  const applicationUri = process.env.MONGODB_URI;
  if (!applicationUri) return DEFAULT_TEST_URI;

  try {
    const testUri = new URL(applicationUri);
    const applicationDatabase = decodeURIComponent(testUri.pathname.replace(/^\/+/, '').split('/')[0] || 'research_platform');
    if (applicationDatabase.endsWith('_test')) return applicationUri;
    testUri.pathname = `/${encodeURIComponent(`${applicationDatabase}_test`)}`;
    return testUri.toString();
  } catch {
    return DEFAULT_TEST_URI;
  }
};

module.exports = { getTestDatabaseUri };