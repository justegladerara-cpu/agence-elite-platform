import hooks from 'eslint-plugin-react-hooks';

// Le runtime JSX automatique n'utilise pas React, mais les composants JSX
// restent des usages de leurs imports. Aucune règle de mise en forme.
const jsx = {
  rules: {
    usages: {
      create(context) {
        return {
          JSXOpeningElement(node) {
            let nom = node.name;
            while (nom.type === 'JSXMemberExpression') nom = nom.object;
            if (nom.type === 'JSXIdentifier' && /^[A-Z]/.test(nom.name)) {
              context.sourceCode.markVariableAsUsed(nom.name, node);
            }
          },
        };
      },
    },
  },
};

export default [{
  files: ['**/*.{js,jsx,cjs,mjs}'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: { 'react-hooks': hooks, jsx },
  rules: {
    'jsx/usages': 'error',
    'react-hooks/rules-of-hooks': 'error',
    'no-unused-vars': ['error', {
      args: 'after-used',
      caughtErrors: 'all',
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      // Extraire une propriété pour l'exclure du reste est un usage utile.
      ignoreRestSiblings: true,
    }],
  },
}];
