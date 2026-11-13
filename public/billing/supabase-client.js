/**
 * Supabase Client Initialization
 * This file initializes and exports the Supabase client
 */

// Initialize Supabase client
const supabaseClient = supabase.createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey
);

/**
 * Check if user is authenticated
 * @returns {Promise<Object|null>} User session or null if not authenticated
 */
async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Get the current session
 * @returns {Promise<Object|null>} Current session or null
 */
async function getCurrentSession() {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

/**
 * Listen to authentication state changes
 * @param {Function} callback Function to call when auth state changes
 */
function onAuthStateChange(callback) {
  return supabaseClient.auth.onAuthStateChange(callback);
}

/**
 * Sign in with email and password
 * @param {string} email User email
 * @param {string} password User password
 * @returns {Promise<Object>} Auth response with user and error
 */
async function signInWithPassword(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return { user: data.user, session: data.session, error: null };
  } catch (error) {
    return { user: null, session: null, error: error.message };
  }
}

/**
 * Sign out the current user
 * @returns {Promise<Object>} Result with error if any
 */
async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get all categories
 * @returns {Promise<Array>} Array of categories or empty array on error
 */
async function getCategories() {
  try {
    const { data, error } = await supabaseClient
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

/**
 * Get a single category by ID
 * @param {string} id Category ID
 * @returns {Promise<Object|null>} Category or null if not found
 */
async function getCategory(id) {
  try {
    const { data, error } = await supabaseClient
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching category:', error);
    return null;
  }
}

/**
 * Create a new category
 * @param {string} name Category name
 * @param {number} displayOrder Category position
 * @returns {Promise<Object>} Result with category data and error
 */
async function createCategory(name, displayOrder) {
  try {
    if (!name || name.trim() === '') {
      throw new Error('Category name is required');
    }
    if (!Number.isSafeInteger(displayOrder) || displayOrder < 1) {
      throw new Error('Display order must be a positive whole number');
    }

    const { data, error } = await supabaseClient
      .from('categories')
      .insert([{ name: name.trim(), display_order: displayOrder }])
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

/**
 * Update a category
 * @param {string} id Category ID
 * @param {string} name New category name
 * @param {number} displayOrder New category position
 * @returns {Promise<Object>} Result with updated category and error
 */
async function updateCategory(id, name, displayOrder) {
  try {
    if (!name || name.trim() === '') {
      throw new Error('Category name is required');
    }
    if (!Number.isSafeInteger(displayOrder) || displayOrder < 1) {
      throw new Error('Display order must be a positive whole number');
    }

    const { data, error } = await supabaseClient
      .from('categories')
      .update({ name: name.trim(), display_order: displayOrder })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

/**
 * Delete a category (only if it has no products)
 * @param {string} id Category ID
 * @returns {Promise<Object>} Result with error if any
 */
async function deleteCategory(id) {
  try {
    // Check if category has any products
    const { data: products, error: checkError } = await supabaseClient
      .from('products')
      .select('id', { count: 'exact' })
      .eq('category_id', id);
    
    if (checkError) throw checkError;
    if (products && products.length > 0) {
      throw new Error(`Cannot delete category with ${products.length} product(s). Please move or delete products first.`);
    }

    const { error } = await supabaseClient
      .from('categories')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get all products (only active products for customers)
 * @param {boolean} onlyActive If true, only return active products
 * @returns {Promise<Array>} Array of products
 */
async function getProducts(onlyActive = false) {
  try {
    let query = supabaseClient
      .from('products')
      .select('*, categories(name)')
      .order('created_at', { ascending: true });
    
    if (onlyActive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

/**
 * Get products by category
 * @param {string} categoryId Category ID
 * @param {boolean} onlyActive If true, only return active products
 * @returns {Promise<Array>} Array of products in category
 */
async function getProductsByCategory(categoryId, onlyActive = false) {
  try {
    let query = supabaseClient
      .from('products')
      .select('*, categories(name)')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: true });
    
    if (onlyActive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching products by category:', error);
    return [];
  }
}

/**
 * Get a single product by ID
 * @param {string} id Product ID
 * @returns {Promise<Object|null>} Product or null if not found
 */
async function getProduct(id) {
  try {
    const { data, error } = await supabaseClient
      .from('products')
      .select('*, categories(name)')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

/**
 * Create a new product
 * @param {Object} productData Product data
 * @returns {Promise<Object>} Result with product data and error
 */
async function createProduct(productData) {
  try {
    const { name, category_id, original_price, cost_price, selling_price, stock_quantity, image_url, image_public_id, description, is_active } = productData;

    // Validate required fields
    if (!name || !category_id || !original_price || !selling_price || !image_url) {
      throw new Error('Missing required fields: name, category_id, original_price, selling_price, image_url');
    }

    const { data, error } = await supabaseClient
      .from('products')
      .insert([{
        name: name.trim(),
        category_id,
        original_price: parseFloat(original_price),
        cost_price: parseFloat(cost_price || 0),
        selling_price: parseFloat(selling_price),
        stock_quantity: parseInt(stock_quantity || 0, 10),
        image_url,
        image_public_id,
        description: description ? description.trim() : null,
        is_active: is_active !== undefined ? is_active : true
      }])
      .select('*, categories(name)')
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

/**
 * Update a product
 * @param {string} id Product ID
 * @param {Object} updates Product updates
 * @returns {Promise<Object>} Result with updated product and error
 */
async function updateProduct(id, updates) {
  try {
    // Only allow specific fields to be updated
    const allowedFields = ['name', 'category_id', 'original_price', 'cost_price', 'selling_price', 'stock_quantity', 'image_url', 'image_public_id', 'description', 'is_active'];
    const cleanUpdates = {};

    for (const key of allowedFields) {
      if (key in updates) {
        if (key === 'original_price' || key === 'cost_price') {
          cleanUpdates[key] = parseFloat(updates[key]);
        } else if (key === 'stock_quantity') {
          cleanUpdates[key] = parseInt(updates[key], 10);
        } else if (key === 'name' || key === 'image_url' || key === 'image_public_id' || key === 'description') {
          cleanUpdates[key] = updates[key] ? updates[key].trim() : updates[key];
        } else {
          cleanUpdates[key] = updates[key];
        }
      }
    }

    if (Object.keys(cleanUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    const { data, error } = await supabaseClient
      .from('products')
      .update(cleanUpdates)
      .eq('id', id)
      .select('*, categories(name)')
      .single();
    
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

/**
 * Delete a product
 * @param {string} id Product ID
 * @returns {Promise<Object>} Result with error if any
 */
async function deleteProduct(id) {
  try {
    const { error } = await supabaseClient
      .from('products')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Upload a product image to Cloudinary using a short-lived server-generated signature.
 * @param {File} file Image file
 * @returns {Promise<Object>} Result with public URL, public ID, and error
 */
async function uploadImage(file) {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    const maxFileSize = 1024 * 1024;
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!supportedTypes.includes(file.type)) {
      throw new Error('Choose a JPEG, PNG, or WebP product image.');
    }

    if (typeof createImageBitmap !== 'function') {
      throw new Error('This browser cannot optimize images. Please use a current browser.');
    }

    const bitmap = await createImageBitmap(file);
    try {
      const maxDimension = 1400;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('The browser could not prepare this image for upload.');
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      let optimizedFile = null;
      for (const quality of [0.82, 0.72, 0.62, 0.52]) {
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('The browser could not compress this image.'));
          }, 'image/webp', quality);
        });

        if (blob.type === 'image/webp' && blob.size <= maxFileSize) {
          optimizedFile = blob;
          break;
        }
      }

      if (!optimizedFile) {
        throw new Error('Image must compress to 1 MB or less. Choose a smaller image.');
      }

      file = optimizedFile;
    } finally {
      bitmap.close();
    }

    const { data: signature, error: signatureError } = await supabaseClient.functions.invoke(
      'cloudinary-images',
      { body: { action: 'sign-upload' } }
    );
    if (signatureError) throw signatureError;
    if (!signature?.cloudName || !signature.apiKey || !signature.signature || !signature.publicId || !signature.folder || !signature.timestamp) {
      throw new Error('The image upload service returned an invalid signature.');
    }

    const formData = new FormData();
    formData.append('file', file, 'product.webp');
    formData.append('api_key', signature.apiKey);
    formData.append('timestamp', String(signature.timestamp));
    formData.append('folder', signature.folder);
    formData.append('public_id', signature.publicId);
    formData.append('overwrite', 'true');
    formData.append('signature', signature.signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`, {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
    if (!response.ok || !result.secure_url || !result.public_id) {
      throw new Error(result.error?.message || 'Cloudinary could not upload this image.');
    }

    return { publicUrl: result.secure_url, publicId: result.public_id, error: null };
  } catch (error) {
    return { publicUrl: null, publicId: null, error: error.message };
  }
}

/**
 * Delete a product image from Cloudinary through the authenticated Edge Function.
 * Old Supabase Storage URLs are intentionally left alone during migration.
 * @param {string} imageUrl Public image URL
 * @param {string} publicId Cloudinary public ID stored on the product row
 * @returns {Promise<Object>} Result with error if any
 */
async function deleteImage(imageUrl, publicId) {
  try {
    if (!imageUrl || !publicId) {
      return { error: null, skipped: true };
    }
    if (!imageUrl.includes('res.cloudinary.com/')) {
      return { error: null, skipped: true };
    }

    const { error } = await supabaseClient.functions.invoke('cloudinary-images', {
      body: { action: 'delete', publicId }
    });
    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
}
