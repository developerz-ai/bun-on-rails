import { describe, it, expect } from 'bun:test'
import {
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
} from '../../src/support/inflector.js'

describe('Inflector', () => {
  describe('singularize', () => {
    it('handles regular plurals', () => {
      expect(singularize('users')).toBe('user')
      expect(singularize('posts')).toBe('post')
      expect(singularize('comments')).toBe('comment')
    })

    it('handles words ending in -ies', () => {
      expect(singularize('categories')).toBe('category')
      expect(singularize('cities')).toBe('city')
      expect(singularize('queries')).toBe('query')
    })

    it('handles words ending in -es', () => {
      expect(singularize('boxes')).toBe('box')
      expect(singularize('buses')).toBe('bus')
      expect(singularize('watches')).toBe('watch')
    })

    it('handles irregular plurals', () => {
      expect(singularize('people')).toBe('person')
      expect(singularize('children')).toBe('child')
      expect(singularize('men')).toBe('man')
      expect(singularize('women')).toBe('woman')
      expect(singularize('mice')).toBe('mouse')
    })

    it('handles words ending in -ves', () => {
      expect(singularize('wolves')).toBe('wolf')
      expect(singularize('wives')).toBe('wife')
    })

    it('handles -ices/-ices endings', () => {
      expect(singularize('matrices')).toBe('matrix')
      expect(singularize('indices')).toBe('index')
    })

    it('handles -ses endings from -sis words', () => {
      expect(singularize('analyses')).toBe('analysis')
      expect(singularize('crises')).toBe('crisis')
    })

    it('handles uncountable words', () => {
      expect(singularize('equipment')).toBe('equipment')
      expect(singularize('information')).toBe('information')
      expect(singularize('news')).toBe('news')
      expect(singularize('series')).toBe('series')
    })

    it('handles empty strings', () => {
      expect(singularize('')).toBe('')
      expect(singularize(null)).toBe(null)
    })

    it('handles database tables', () => {
      expect(singularize('databases')).toBe('database')
    })
  })

  describe('pluralize', () => {
    it('handles regular singulars', () => {
      expect(pluralize('user')).toBe('users')
      expect(pluralize('post')).toBe('posts')
      expect(pluralize('comment')).toBe('comments')
    })

    it('handles words ending in -y', () => {
      expect(pluralize('category')).toBe('categories')
      expect(pluralize('city')).toBe('cities')
      expect(pluralize('query')).toBe('queries')
    })

    it('handles words ending in -s, -x, -ch, -sh', () => {
      expect(pluralize('box')).toBe('boxes')
      expect(pluralize('bus')).toBe('buses')
      expect(pluralize('watch')).toBe('watches')
      expect(pluralize('dish')).toBe('dishes')
    })

    it('handles irregular singulars', () => {
      expect(pluralize('person')).toBe('people')
      expect(pluralize('child')).toBe('children')
      expect(pluralize('man')).toBe('men')
      expect(pluralize('woman')).toBe('women')
      expect(pluralize('mouse')).toBe('mice')
    })

    it('handles words ending in -f/-fe', () => {
      expect(pluralize('wolf')).toBe('wolves')
      expect(pluralize('wife')).toBe('wives')
    })

    it('handles -ix/-ex endings', () => {
      expect(pluralize('matrix')).toBe('matrices')
      expect(pluralize('index')).toBe('indices')
    })

    it('handles -is endings', () => {
      expect(pluralize('analysis')).toBe('analyses')
      expect(pluralize('crisis')).toBe('crises')
    })

    it('handles uncountable words', () => {
      expect(pluralize('equipment')).toBe('equipment')
      expect(pluralize('information')).toBe('information')
      expect(pluralize('news')).toBe('news')
      expect(pluralize('series')).toBe('series')
    })
  })

  describe('camelize', () => {
    it('converts snake_case to camelCase', () => {
      expect(camelize('user_name')).toBe('userName')
      expect(camelize('first_name')).toBe('firstName')
      expect(camelize('blog_post_id')).toBe('blogPostId')
    })

    it('converts kebab-case to camelCase', () => {
      expect(camelize('user-name')).toBe('userName')
      expect(camelize('first-name')).toBe('firstName')
    })
  })

  describe('pascalize', () => {
    it('converts snake_case to PascalCase', () => {
      expect(pascalize('user_name')).toBe('UserName')
      expect(pascalize('first_name')).toBe('FirstName')
    })

    it('converts kebab-case to PascalCase', () => {
      expect(pascalize('user-name')).toBe('UserName')
    })
  })

  describe('underscore', () => {
    it('converts camelCase to snake_case', () => {
      expect(underscore('userName')).toBe('user_name')
      expect(underscore('firstName')).toBe('first_name')
    })

    it('converts PascalCase to snake_case', () => {
      expect(underscore('UserName')).toBe('user_name')
      expect(underscore('BlogPost')).toBe('blog_post')
    })
  })

  describe('dasherize', () => {
    it('converts snake_case to kebab-case', () => {
      expect(dasherize('user_name')).toBe('user-name')
    })

    it('converts camelCase to kebab-case', () => {
      expect(dasherize('userName')).toBe('user-name')
    })
  })

  describe('capitalize', () => {
    it('capitalizes first letter', () => {
      expect(capitalize('hello')).toBe('Hello')
      expect(capitalize('world')).toBe('World')
    })

    it('handles empty string', () => {
      expect(capitalize('')).toBe('')
    })
  })

  describe('classify', () => {
    it('converts table name to class name', () => {
      expect(classify('users')).toBe('User')
      expect(classify('blog_posts')).toBe('BlogPost')
      expect(classify('categories')).toBe('Category')
    })
  })

  describe('tableize', () => {
    it('converts class name to table name', () => {
      expect(tableize('User')).toBe('users')
      expect(tableize('BlogPost')).toBe('blog_posts')
      expect(tableize('Category')).toBe('categories')
    })
  })

  describe('foreignKey', () => {
    it('converts class name to foreign key', () => {
      expect(foreignKey('User')).toBe('user_id')
      expect(foreignKey('BlogPost')).toBe('blog_post_id')
    })
  })

  describe('custom inflections', () => {
    it('allows adding custom irregular words', () => {
      addIrregular('cactus', 'cacti')
      expect(pluralize('cactus')).toBe('cacti')
      expect(singularize('cacti')).toBe('cactus')
    })

    it('allows adding uncountable words', () => {
      addUncountable('jeans')
      expect(singularize('jeans')).toBe('jeans')
      expect(pluralize('jeans')).toBe('jeans')
    })
  })
})
