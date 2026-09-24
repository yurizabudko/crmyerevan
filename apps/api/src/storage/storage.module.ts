import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { FILE_STORAGE, LocalDiskStorage } from './file-storage.js';

@Global()
@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new LocalDiskStorage(config.FILES_DIR),
    },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
