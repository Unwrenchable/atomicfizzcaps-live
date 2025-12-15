// ESLint configuration for Node.js project
module.exports = [
    {
        ignores: ['node_modules/**', 'public/**'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                // Node.js globals
                global: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                setImmediate: 'readonly',
                setInterval: 'readonly',
                setTimeout: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
        },
    },
];
