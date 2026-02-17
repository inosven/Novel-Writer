import { useState, useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';

interface Character {
  name: string;
  role: 'protagonist' | 'major' | 'minor';
  description: string;
  appearances: number[];
  profile: string;
}

export default function Characters() {
  const { projectPath } = useProjectStore();

  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (projectPath) {
      loadCharacters();
    }
  }, [projectPath]);

  const loadCharacters = async () => {
    if (!window.electronAPI) return;
    try {
      // characters.list() returns string[] (names only), need to load full details
      const charNames: string[] = await window.electronAPI.characters.list();
      console.log('[Characters] Character names:', charNames);

      if (!charNames || charNames.length === 0) {
        setCharacters([]);
        return;
      }

      // Load full character data for each name
      const fullCharacters: Character[] = [];
      for (const name of charNames) {
        try {
          const charData = await window.electronAPI.characters.get(name);
          if (charData) {
            fullCharacters.push({
              name: charData.name || name,
              role: charData.role === 'protagonist' ? 'protagonist'
                : charData.role === 'major' ? 'major' : 'minor',
              description: charData.personality?.core || charData.basicInfo?.occupation || '',
              appearances: Array.isArray(charData.appearances) ? charData.appearances : [],
              profile: charData.profile || charData.background || '',
            });
          }
        } catch (err) {
          console.warn(`[Characters] Failed to load character "${name}":`, err);
        }
      }

      console.log('[Characters] Loaded full characters:', fullCharacters.length);
      setCharacters(fullCharacters);
      if (fullCharacters.length > 0 && !selectedCharacter) {
        setSelectedCharacter(fullCharacters[0]);
        setEditContent(fullCharacters[0].profile || '');
      }
    } catch (error) {
      console.error('Failed to load characters:', error);
      setCharacters([]);
    }
  };

  const handleSelectCharacter = (character: Character) => {
    if (isEditing) {
      if (!confirm('有未保存的更改，确定要切换吗？')) {
        return;
      }
    }
    setSelectedCharacter(character);
    setEditContent(character.profile);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!selectedCharacter || !window.electronAPI) return;
    setIsSaving(true);
    try {
      await window.electronAPI.characters.update(selectedCharacter.name, {
        ...selectedCharacter,
        profile: editContent,
      });
      setSelectedCharacter({
        ...selectedCharacter,
        profile: editContent,
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save character:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newCharacterName.trim() || !window.electronAPI) return;
    try {
      const newChar: Character = {
        name: newCharacterName.trim(),
        role: 'minor',
        description: '',
        appearances: [],
        profile: `# ${newCharacterName.trim()}

## 基础信息
- 年龄:
- 性别:
- 身份:
- 外貌:

## 性格特点
- 核心:
- 优点:
- 缺点:

## 背景故事


## 人物关系


## 角色弧光
- 起点:
- 转变:
- 终点:

## 在故事中的作用
`,
      };
      await window.electronAPI.characters.create(newChar.name, newChar.profile);
      setCharacters([...characters, newChar]);
      setSelectedCharacter(newChar);
      setEditContent(newChar.profile);
      setIsCreating(false);
      setNewCharacterName('');
    } catch (error) {
      console.error('Failed to create character:', error);
    }
  };

  const handleDelete = async () => {
    if (!selectedCharacter || !window.electronAPI) return;

    const warningMessage = selectedCharacter.appearances.length > 0
      ? `角色 "${selectedCharacter.name}" 在第 ${selectedCharacter.appearances.join(', ')} 章出现。确定要删除吗？`
      : `确定要删除角色 "${selectedCharacter.name}" 吗？`;

    if (!confirm(warningMessage)) return;

    try {
      await window.electronAPI.characters.delete(selectedCharacter.name);
      const newChars = characters.filter(c => c.name !== selectedCharacter.name);
      setCharacters(newChars);
      setSelectedCharacter(newChars[0] || null);
      setEditContent(newChars[0]?.profile || '');
    } catch (error) {
      console.error('Failed to delete character:', error);
    }
  };

  const getRoleBadge = (role: Character['role']) => {
    switch (role) {
      case 'protagonist':
        return { text: '主角', class: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
      case 'major':
        return { text: '重要', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
      case 'minor':
      default:
        return { text: '配角', class: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400' };
    }
  };

  if (!projectPath) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            请先打开或创建一个项目
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* Character List */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 dark:text-white">👥 角色列表</h2>
            <button
              onClick={() => setIsCreating(true)}
              className="text-blue-500 hover:text-blue-600"
              title="创建新角色"
            >
              + 新建
            </button>
          </div>

          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            {characters.map((character) => (
              <button
                key={character.name}
                onClick={() => handleSelectCharacter(character)}
                className={`w-full p-3 text-left border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  selectedCharacter?.name === character.name ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-800 dark:text-white">
                    {character.name}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getRoleBadge(character.role).class}`}>
                    {getRoleBadge(character.role).text}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {character.description || '暂无描述'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  出场: {character.appearances.length}章
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Character Detail */}
      <div className="flex-1 flex flex-col">
        {selectedCharacter ? (
          <>
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                    👤 {selectedCharacter.name}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">
                    {selectedCharacter.description}
                  </p>
                </div>
                <div className="flex space-x-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => {
                          setEditContent(selectedCharacter.profile);
                          setIsEditing(false);
                        }}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                      >
                        {isSaving ? '保存中...' : '保存'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                      >
                        ✏️ 编辑
                      </button>
                      <button
                        onClick={handleDelete}
                        className="px-4 py-2 border border-red-300 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        🗑️ 删除
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Warning for appearances */}
              {selectedCharacter.appearances.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
                  ⚠️ {selectedCharacter.name} 在第 {selectedCharacter.appearances.join(', ')} 章出现，修改可能影响一致性
                </div>
              )}
            </div>

            {/* Profile Editor */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full p-4 bg-transparent text-gray-800 dark:text-white resize-none focus:outline-none font-mono text-sm"
                  placeholder="输入角色小传..."
                />
              ) : (
                <div className="p-4 prose dark:prose-invert max-w-none overflow-y-auto h-full">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200">
                    {selectedCharacter.profile}
                  </pre>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <p className="text-gray-500 dark:text-gray-400">
              选择一个角色查看详情，或创建新角色
            </p>
          </div>
        )}
      </div>

      {/* Create Character Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
              创建新角色
            </h2>
            <input
              type="text"
              value={newCharacterName}
              onChange={(e) => setNewCharacterName(e.target.value)}
              placeholder="角色名称"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewCharacterName('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newCharacterName.trim()}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
