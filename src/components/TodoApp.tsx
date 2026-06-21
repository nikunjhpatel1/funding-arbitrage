import React, { useState, useEffect } from 'react';
import './TodoApp.css';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
}

const TodoApp: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [category, setCategory] = useState('general');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'priority' | 'name'>('date');

  // Load todos from localStorage on mount
  useEffect(() => {
    const savedTodos = localStorage.getItem('todos');
    if (savedTodos) {
      try {
        setTodos(JSON.parse(savedTodos));
      } catch (error) {
        console.error('Failed to parse todos from localStorage:', error);
      }
    }
  }, []);

  // Save todos to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  const addTodo = () => {
    if (inputValue.trim() === '') return;

    const newTodo: Todo = {
      id: Date.now().toString(),
      text: inputValue,
      completed: false,
      createdAt: Date.now(),
      dueDate: dueDate || undefined,
      priority,
      category,
    };

    setTodos([newTodo, ...todos]);
    setInputValue('');
    setDueDate('');
    setPriority('medium');
    setCategory('general');
  };

  const deleteTodo = (id: string) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const toggleTodo = (id: string) => {
    setTodos(
      todos.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  const updateTodo = (id: string, updatedText: string) => {
    setTodos(
      todos.map(todo =>
        todo.id === id ? { ...todo, text: updatedText } : todo
      )
    );
  };

  const clearCompleted = () => {
    setTodos(todos.filter(todo => !todo.completed));
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  const sortedTodos = [...filteredTodos].sort((a, b) => {
    if (sortBy === 'priority') {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    if (sortBy === 'name') {
      return a.text.localeCompare(b.text);
    }
    return b.createdAt - a.createdAt;
  });

  const stats = {
    total: todos.length,
    completed: todos.filter(t => t.completed).length,
    active: todos.filter(t => !t.completed).length,
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  };

  return (
    <div className="todo-container">
      <div className="todo-header">
        <h1>📋 My To-Do List</h1>
        <div className="stats">
          <span className="stat-item">
            <strong>{stats.total}</strong> Total
          </span>
          <span className="stat-item">
            <strong>{stats.active}</strong> Active
          </span>
          <span className="stat-item">
            <strong>{stats.completed}</strong> Completed
          </span>
        </div>
      </div>

      <div className="todo-input-section">
        <div className="input-group">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add a new task..."
            className="todo-input"
          />
          <button onClick={addTodo} className="btn btn-add">
            Add
          </button>
        </div>

        <div className="input-options">
          <div className="option-group">
            <label htmlFor="due-date">Due Date:</label>
            <input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="option-group">
            <label htmlFor="priority">Priority:</label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
              className="input-field"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="option-group">
            <label htmlFor="category">Category:</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-field"
            >
              <option value="general">General</option>
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              <option value="shopping">Shopping</option>
              <option value="health">Health</option>
            </select>
          </div>
        </div>
      </div>

      <div className="filters-and-sort">
        <div className="filter-buttons">
          <button
            className={`btn ${filter === 'all' ? 'btn-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`btn ${filter === 'active' ? 'btn-active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            className={`btn ${filter === 'completed' ? 'btn-active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed
          </button>
        </div>

        <div className="sort-options">
          <label htmlFor="sort">Sort by:</label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'priority' | 'name')}
            className="input-field"
          >
            <option value="date">Date Added</option>
            <option value="priority">Priority</option>
            <option value="name">Alphabetical</option>
          </select>
        </div>
      </div>

      <div className="todo-list">
        {sortedTodos.length === 0 ? (
          <div className="empty-state">
            <p>No tasks yet! 🎉</p>
            <p className="empty-hint">Add your first task above to get started.</p>
          </div>
        ) : (
          sortedTodos.map(todo => (
            <div
              key={todo.id}
              className={`todo-item ${todo.completed ? 'completed' : ''} priority-${todo.priority}`}
            >
              <div className="todo-checkbox-wrapper">
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo.id)}
                  className="todo-checkbox"
                />
              </div>

              <div className="todo-content">
                <input
                  type="text"
                  value={todo.text}
                  onChange={(e) => updateTodo(todo.id, e.target.value)}
                  className="todo-text"
                  disabled={todo.completed}
                />
                <div className="todo-meta">
                  <span className={`badge category-badge category-${todo.category}`}>
                    {todo.category}
                  </span>
                  <span className={`badge priority-badge priority-${todo.priority}`}>
                    {todo.priority}
                  </span>
                  {todo.dueDate && (
                    <span className="badge due-date-badge">
                      📅 {new Date(todo.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => deleteTodo(todo.id)}
                className="btn btn-delete"
                title="Delete task"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {todos.some(t => t.completed) && (
        <div className="footer-actions">
          <button onClick={clearCompleted} className="btn btn-clear">
            Clear Completed ({stats.completed})
          </button>
        </div>
      )}
    </div>
  );
};

export default TodoApp;
