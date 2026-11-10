/**
 * Inflector - String inflection utilities
 *
 * Provides Rails-like inflection methods for singularizing, pluralizing,
 * and transforming strings between different naming conventions.
 *
 * @module bun-on-rails/support/inflector
 */

/**
 * Irregular plural mappings (singular -> plural)
 * @private
 */
const IRREGULAR_PLURALS = new Map([
  ['person', 'people'],
  ['man', 'men'],
  ['woman', 'women'],
  ['child', 'children'],
  ['ox', 'oxen'],
  ['goose', 'geese'],
  ['foot', 'feet'],
  ['tooth', 'teeth'],
  ['mouse', 'mice'],
  ['louse', 'lice'],
  ['criterion', 'criteria'],
  ['phenomenon', 'phenomena'],
  ['datum', 'data'],
  ['medium', 'media'],
  ['analysis', 'analyses'],
  ['basis', 'bases'],
  ['crisis', 'crises'],
  ['diagnosis', 'diagnoses'],
  ['hypothesis', 'hypotheses'],
  ['parenthesis', 'parentheses'],
  ['thesis', 'theses'],
  ['index', 'indices'],
  ['matrix', 'matrices'],
  ['vertex', 'vertices'],
  ['appendix', 'appendices'],
  ['quiz', 'quizzes'],
  ['move', 'moves'],
  ['sex', 'sexes'],
])

/**
 * Reverse mapping (plural -> singular)
 * @private
 */
const IRREGULAR_SINGULARS = new Map(
  Array.from(IRREGULAR_PLURALS.entries()).map(([s, p]) => [p, s])
)

/**
 * Uncountable words (same in singular and plural)
 * @private
 */
const UNCOUNTABLES = new Set([
  'equipment', 'information', 'rice', 'money', 'species', 'series',
  'fish', 'sheep', 'deer', 'aircraft', 'moose', 'swine', 'buffalo',
  'shrimp', 'trout', 'news', 'headquarters', 'feedback', 'data',
  'metadata', 'cache', 'status', 'media'
])

/**
 * Pluralization rules (ordered from most specific to general)
 * @private
 */
const PLURAL_RULES = [
  [/(.*)(?:([^f]))fe?$/i, '$1$2ves'],  // wife -> wives, knife -> knives
  [/(quiz)$/i, '$1zes'],                // quiz -> quizzes
  [/^(ox)$/i, '$1en'],                  // ox -> oxen
  [/([m|l])ouse$/i, '$1ice'],          // mouse -> mice
  [/(matr|vert|ind)(?:ix|ex)$/i, '$1ices'], // matrix -> matrices
  [/(x|ch|ss|sh)$/i, '$1es'],          // box -> boxes, church -> churches
  [/([^aeiouy]|qu)y$/i, '$1ies'],      // city -> cities
  [/(hive)$/i, '$1s'],                  // hive -> hives
  [/(?:([^f])fe|([lrf])f)$/i, '$1$2ves'], // leaf -> leaves
  [/sis$/i, 'ses'],                     // analysis -> analyses
  [/([ti])um$/i, '$1a'],               // datum -> data
  [/(buffal|tomat|potat|ech|her|vet)o$/i, '$1oes'], // potato -> potatoes
  [/(bu)s$/i, '$1ses'],                // bus -> buses
  [/(alias|status)$/i, '$1es'],        // alias -> aliases
  [/(octop|vir)us$/i, '$1i'],          // octopus -> octopi
  [/(ax|test)is$/i, '$1es'],           // axis -> axes
  [/s$/i, 's'],                         // already plural, keep as is
  [/$/, 's']                            // default: add s
]

/**
 * Singularization rules (ordered from most specific to general)
 * @private
 */
const SINGULAR_RULES = [
  [/(database)s$/i, '$1'],              // databases -> database
  [/(quiz)zes$/i, '$1'],                // quizzes -> quiz
  [/(matr)ices$/i, '$1ix'],            // matrices -> matrix
  [/(vert|ind)ices$/i, '$1ex'],        // vertices -> vertex
  [/^(ox)en$/i, '$1'],                  // oxen -> ox
  [/(alias|status)es$/i, '$1'],        // aliases -> alias
  [/(octop|vir)i$/i, '$1us'],          // octopi -> octopus
  [/(cris|ax|test)es$/i, '$1is'],      // crises -> crisis
  [/(shoe)s$/i, '$1'],                  // shoes -> shoe
  [/(o)es$/i, '$1'],                    // potatoes -> potato
  [/(bus)es$/i, '$1'],                  // buses -> bus
  [/([m|l])ice$/i, '$1ouse'],          // mice -> mouse
  [/(x|ch|ss|sh)es$/i, '$1'],          // boxes -> box
  [/(m)ovies$/i, '$1ovie'],            // movies -> movie
  [/(s)eries$/i, '$1eries'],           // series -> series
  [/([^aeiouy]|qu)ies$/i, '$1y'],      // cities -> city, queries -> query
  [/([lr])ves$/i, '$1f'],              // wolves -> wolf
  [/(tive)s$/i, '$1'],                  // motives -> motive
  [/(hive)s$/i, '$1'],                  // hives -> hive
  [/([^f])ves$/i, '$1fe'],             // wives -> wife
  [/(^analy)ses$/i, '$1sis'],          // analyses -> analysis
  [/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$/i, '$1$2sis'],
  [/([ti])a$/i, '$1um'],               // data -> datum
  [/(n)ews$/i, '$1ews'],               // news -> news
  [/s$/i, '']                           // default: remove trailing s
]

/**
 * Convert a word to its singular form
 *
 * @param {string} word - The word to singularize
 * @returns {string} The singular form
 *
 * @example
 * singularize('users')      // 'user'
 * singularize('people')     // 'person'
 * singularize('categories') // 'category'
 * singularize('children')   // 'child'
 */
export function singularize(word) {
  if (!word || word.length === 0) return word

  const lower = word.toLowerCase()

  // Check uncountables
  if (UNCOUNTABLES.has(lower)) {
    return word
  }

  // Check irregular mappings
  if (IRREGULAR_SINGULARS.has(lower)) {
    const singular = IRREGULAR_SINGULARS.get(lower)
    // Preserve original case
    return preserveCase(word, singular)
  }

  // Apply rules
  for (const [pattern, replacement] of SINGULAR_RULES) {
    if (pattern.test(word)) {
      return word.replace(pattern, replacement)
    }
  }

  return word
}

/**
 * Convert a word to its plural form
 *
 * @param {string} word - The word to pluralize
 * @returns {string} The plural form
 *
 * @example
 * pluralize('user')     // 'users'
 * pluralize('person')   // 'people'
 * pluralize('category') // 'categories'
 * pluralize('child')    // 'children'
 */
export function pluralize(word) {
  if (!word || word.length === 0) return word

  const lower = word.toLowerCase()

  // Check uncountables
  if (UNCOUNTABLES.has(lower)) {
    return word
  }

  // Check irregular mappings
  if (IRREGULAR_PLURALS.has(lower)) {
    const plural = IRREGULAR_PLURALS.get(lower)
    // Preserve original case
    return preserveCase(word, plural)
  }

  // Apply rules
  for (const [pattern, replacement] of PLURAL_RULES) {
    if (pattern.test(word)) {
      return word.replace(pattern, replacement)
    }
  }

  return word
}

/**
 * Convert a string to camelCase
 *
 * @param {string} str - The string to convert
 * @returns {string} The camelCase version
 *
 * @example
 * camelize('user_name')    // 'userName'
 * camelize('first-name')   // 'firstName'
 */
export function camelize(str) {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toLowerCase())
}

/**
 * Convert a string to PascalCase
 *
 * @param {string} str - The string to convert
 * @returns {string} The PascalCase version
 *
 * @example
 * pascalize('user_name')   // 'UserName'
 * pascalize('first-name')  // 'FirstName'
 */
export function pascalize(str) {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toUpperCase())
}

/**
 * Convert a string to snake_case
 *
 * @param {string} str - The string to convert
 * @returns {string} The snake_case version
 *
 * @example
 * underscore('UserName')   // 'user_name'
 * underscore('firstName')  // 'first_name'
 */
export function underscore(str) {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()
}

/**
 * Convert a string to dash-case (kebab-case)
 *
 * @param {string} str - The string to convert
 * @returns {string} The dash-case version
 *
 * @example
 * dasherize('user_name')   // 'user-name'
 * dasherize('firstName')   // 'first-name'
 */
export function dasherize(str) {
  return underscore(str).replace(/_/g, '-')
}

/**
 * Capitalize the first letter of a string
 *
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string
 */
export function capitalize(str) {
  if (!str || str.length === 0) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Convert a table name to a model class name
 *
 * @param {string} tableName - The table name (e.g., 'users', 'blog_posts')
 * @returns {string} The model class name (e.g., 'User', 'BlogPost')
 *
 * @example
 * tableize('users')       // Returns model name 'User'
 * tableize('blog_posts')  // Returns model name 'BlogPost'
 */
export function classify(tableName) {
  return pascalize(singularize(tableName))
}

/**
 * Convert a model class name to a table name
 *
 * @param {string} className - The class name (e.g., 'User', 'BlogPost')
 * @returns {string} The table name (e.g., 'users', 'blog_posts')
 *
 * @example
 * tableize('User')      // 'users'
 * tableize('BlogPost')  // 'blog_posts'
 */
export function tableize(className) {
  return pluralize(underscore(className))
}

/**
 * Convert a model class name to a foreign key column name
 *
 * @param {string} className - The class name (e.g., 'User', 'BlogPost')
 * @returns {string} The foreign key name (e.g., 'user_id', 'blog_post_id')
 *
 * @example
 * foreignKey('User')      // 'user_id'
 * foreignKey('BlogPost')  // 'blog_post_id'
 */
export function foreignKey(className) {
  return `${underscore(className)}_id`
}

/**
 * Helper to preserve the case pattern of the original word
 * @private
 */
function preserveCase(original, replacement) {
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase()
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/**
 * Add a custom irregular plural mapping
 *
 * @param {string} singular - The singular form
 * @param {string} plural - The plural form
 *
 * @example
 * addIrregular('cactus', 'cacti')
 */
export function addIrregular(singular, plural) {
  IRREGULAR_PLURALS.set(singular.toLowerCase(), plural.toLowerCase())
  IRREGULAR_SINGULARS.set(plural.toLowerCase(), singular.toLowerCase())
}

/**
 * Add a word to the uncountable list
 *
 * @param {string} word - The uncountable word
 *
 * @example
 * addUncountable('jeans')
 */
export function addUncountable(word) {
  UNCOUNTABLES.add(word.toLowerCase())
}

export default {
  singularize,
  pluralize,
  camelize,
  pascalize,
  underscore,
  dasherize,
  capitalize,
  classify,
  tableize,
  foreignKey,
  addIrregular,
  addUncountable
}
