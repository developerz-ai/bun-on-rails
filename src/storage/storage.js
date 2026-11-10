/**
 * Storage - File upload and storage system
 */

import { NotImplementedError } from '../support/not_implemented.js'

export class Storage {
  constructor(adapter) {
    this.adapter = adapter
  }

  /**
   * Upload a file
   * @param {File|Blob|Buffer} file
   * @param {Object} options
   * @returns {Promise<StoredFile>}
   */
  async upload(_file, _options = {}) {
    // TODO: Generate key
    // TODO: Upload via adapter
    // TODO: Return StoredFile
    throw new NotImplementedError('Storage#upload', 'file storage')
  }

  /**
   * Get a file by key
   * @param {string} key
   * @returns {Promise<StoredFile>}
   */
  async get(_key) {
    // TODO: Get file info from adapter
    throw new NotImplementedError('Storage#get', 'file storage')
  }

  /**
   * Delete a file
   * @param {string} key
   */
  async delete(_key) {
    // TODO: Delete via adapter
    throw new NotImplementedError('Storage#delete', 'file storage')
  }

  /**
   * Get a signed URL for direct upload
   * @param {string} filename
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async getUploadUrl(_filename, _options = {}) {
    // TODO: Generate presigned URL for direct upload
    throw new NotImplementedError('Storage#getUploadUrl', 'file storage')
  }

  /**
   * Get a public URL for a file
   * @param {string} key
   * @param {Object} options
   * @returns {string}
   */
  url(key, options = {}) {
    return this.adapter.url(key, options)
  }
}

/**
 * Stored File - Represents an uploaded file
 */
export class StoredFile {
  constructor(data) {
    this.key = data.key
    this.filename = data.filename
    this.contentType = data.contentType
    this.size = data.size
    this.metadata = data.metadata || {}
  }

  /**
   * Get public URL
   * @param {string} variant
   * @returns {string}
   */
  url(_variant = null) {
    // TODO: Return URL, optionally with variant
    throw new NotImplementedError('StoredFile#url', 'file storage')
  }

  /**
   * Download file content
   * @returns {Promise<Buffer>}
   */
  async download() {
    // TODO: Download from storage
    throw new NotImplementedError('StoredFile#download', 'file storage')
  }

  /**
   * Delete the file
   */
  async delete() {
    // TODO: Delete from storage
    throw new NotImplementedError('StoredFile#delete', 'file storage')
  }
}

/**
 * Attachment - Model attachment handling
 */
export class Attachment {
  constructor(model, name, options = {}) {
    this.model = model
    this.name = name
    this.options = options
  }

  /**
   * Attach a file
   * @param {File|Blob|Buffer} file
   */
  async attach(_file) {
    // TODO: Upload file
    // TODO: Generate variants if image
    // TODO: Update model record
    throw new NotImplementedError('Attachment#attach', 'file storage')
  }

  /**
   * Detach (remove) the file
   */
  async detach() {
    // TODO: Delete from storage
    // TODO: Delete variants
    // TODO: Update model record
    throw new NotImplementedError('Attachment#detach', 'file storage')
  }

  /**
   * Check if attached
   * @returns {boolean}
   */
  get attached() {
    // TODO: Check if model has attachment
    throw new NotImplementedError('Attachment#attached', 'file storage')
  }

  /**
   * Get URL for variant
   * @param {string} variant
   * @returns {string}
   */
  urlVariant(_variant = null) {
    // TODO: Return URL
    throw new NotImplementedError('Attachment#urlVariant', 'file storage')
  }
}

/**
 * Storage Adapters
 */
export const StorageAdapters = {
  /**
   * Local filesystem adapter (development)
   */
  local: {
    async upload(_file, _key) {
      // TODO: Write to disk
      throw new NotImplementedError('StorageAdapters.local.upload', 'file storage')
    },
    async get(_key) {
      // TODO: Read from disk
      throw new NotImplementedError('StorageAdapters.local.get', 'file storage')
    },
    async delete(_key) {
      // TODO: Delete from disk
      throw new NotImplementedError('StorageAdapters.local.delete', 'file storage')
    },
    url(_key) {
      // TODO: Return local URL
      throw new NotImplementedError('StorageAdapters.local.url', 'file storage')
    }
  },

  /**
   * S3-compatible adapter (S3, R2, DigitalOcean Spaces)
   */
  s3: {
    async upload(_file, _key, _options) {
      // TODO: Upload to S3
      throw new NotImplementedError('StorageAdapters.s3.upload', 'file storage')
    },
    async get(_key) {
      // TODO: Get from S3
      throw new NotImplementedError('StorageAdapters.s3.get', 'file storage')
    },
    async delete(_key) {
      // TODO: Delete from S3
      throw new NotImplementedError('StorageAdapters.s3.delete', 'file storage')
    },
    url(_key, _options) {
      // TODO: Return S3 URL (signed or public)
      throw new NotImplementedError('StorageAdapters.s3.url', 'file storage')
    },
    async getUploadUrl(_key, _options) {
      // TODO: Generate presigned upload URL
      throw new NotImplementedError('StorageAdapters.s3.getUploadUrl', 'file storage')
    }
  }
}

/**
 * Image Processor - Generate image variants
 */
export class ImageProcessor {
  /**
   * Generate a variant
   * @param {Buffer} buffer
   * @param {Object} options
   * @returns {Promise<Buffer>}
   */
  static async process(_buffer, _options = {}) {
    // TODO: Resize, crop, format conversion
    // TODO: Use sharp or similar
    throw new NotImplementedError('ImageProcessor.process', 'file storage')
  }

  /**
   * Get image dimensions
   * @param {Buffer} buffer
   * @returns {Promise<{width: number, height: number}>}
   */
  static async dimensions(_buffer) {
    // TODO: Read image metadata
    throw new NotImplementedError('ImageProcessor.dimensions', 'file storage')
  }
}
