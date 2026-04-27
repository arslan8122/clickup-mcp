import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Config {
  apiKey: string;
  spaceName?: string;
  listId?: string;
  userId?: number;
  teamId?: string;
}

export function loadConfig(): Config {
  const config: Config = {
    apiKey: process.env.CLICKUP_API_KEY || '',
    spaceName: process.env.CLICKUP_SPACE_NAME,
    listId: process.env.CLICKUP_LIST_ID,
    userId: process.env.CLICKUP_USER_ID ? parseInt(process.env.CLICKUP_USER_ID) : undefined,
    teamId: process.env.CLICKUP_TEAM_ID,
  };

  // Try to load from .env file if environment variables are not set
  if (!config.apiKey) {
    try {
      const envPath = join(__dirname, '../.env');
      const envContent = readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          if (key === 'CLICKUP_API_KEY') config.apiKey = value;
          if (key === 'CLICKUP_SPACE_NAME') config.spaceName = value;
          if (key === 'CLICKUP_LIST_ID') config.listId = value;
          if (key === 'CLICKUP_USER_ID') config.userId = parseInt(value);
          if (key === 'CLICKUP_TEAM_ID') config.teamId = value;
        }
      });
    } catch (error) {
      // .env file doesn't exist, that's okay
    }
  }

  if (!config.apiKey) {
    throw new Error('CLICKUP_API_KEY is required. Set it as an environment variable or in .env file');
  }

  return config;
}
