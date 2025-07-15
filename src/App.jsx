import { useState, useRef, useCallback, useEffect } from 'react';
import Delete from './assets/delete.svg';
import Undo from './assets/undo.svg';
import Redo from './assets/redo.svg';
import Reset from './assets/reset.svg';

function App() {
  const [polygons, setPolygons] = useState([]);
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [draggedVertex, setDraggedVertex] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedPolygon, setSelectedPolygon] = useState(null);
  const [snapTarget, setSnapTarget] = useState(null); // For vertex snapping

  // Undo/Redo state management
  const [history, setHistory] = useState([{ polygons: [], currentPolygon: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const svgRef = useRef(null);

  // Get mouse coordinates relative to SVG
  const getSVGCoordinates = useCallback((event) => {
    if (!svgRef.current) return { x: 0, y: 0 };

    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }, []);

  // Check if a point is close to another point
  const isNearPoint = useCallback((point1, point2, threshold = 15) => {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  }, []);

  // Find the nearest vertex to snap to
  const findSnapTarget = useCallback((coords, snapThreshold = 12) => {
    // Check all vertices in completed polygons
    for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
      const polygon = polygons[polygonIndex];
      for (let vertexIndex = 0; vertexIndex < polygon.length; vertexIndex++) {
        const vertex = polygon[vertexIndex];
        if (isNearPoint(coords, vertex, snapThreshold)) {
          return {
            vertex,
            polygonIndex,
            vertexIndex,
            type: 'completed'
          };
        }
      }
    }

    // Check vertices in current polygon (excluding the one being dragged)
    for (let vertexIndex = 0; vertexIndex < currentPolygon.length; vertexIndex++) {
      const vertex = currentPolygon[vertexIndex];
      if (isNearPoint(coords, vertex, snapThreshold)) {
        return {
          vertex,
          polygonIndex: -1, // Current polygon
          vertexIndex,
          type: 'current'
        };
      }
    }

    return null;
  }, [polygons, currentPolygon, isNearPoint]);

  // Save state to history for undo/redo
  const saveToHistory = useCallback((newPolygons, newCurrentPolygon) => {
    const newState = {
      polygons: JSON.parse(JSON.stringify(newPolygons)),
      currentPolygon: JSON.parse(JSON.stringify(newCurrentPolygon))
    };

    setHistory(prev => {
      // Remove any future history if we're not at the end
      const newHistory = prev.slice(0, historyIndex + 1);
      // Add new state
      newHistory.push(newState);
      // Limit history to 50 entries
      if (newHistory.length > 50) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });

    setHistoryIndex(prev => {
      const newIndex = Math.min(prev + 1, 49);
      return newIndex;
    });
  }, [historyIndex]);

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const prevState = history[newIndex];
      setPolygons(prevState.polygons);
      setCurrentPolygon(prevState.currentPolygon);
      setHistoryIndex(newIndex);
      setSelectedPolygon(null);
      setIsDrawing(prevState.currentPolygon.length > 0);
    }
  }, [history, historyIndex]);

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const nextState = history[newIndex];
      setPolygons(nextState.polygons);
      setCurrentPolygon(nextState.currentPolygon);
      setHistoryIndex(newIndex);
      setSelectedPolygon(null);
      setIsDrawing(nextState.currentPolygon.length > 0);
    }
  }, [history, historyIndex]);

  // Check if undo/redo are available
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ctrl+Z for undo (Cmd+Z on Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z or Ctrl+Y for redo (Cmd+Shift+Z or Cmd+Y on Mac)
      else if (((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Z') ||
        ((event.ctrlKey || event.metaKey) && event.key === 'y')) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Handle mouse move for preview line and dragging
  const handleMouseMove = useCallback((event) => {
    const coords = getSVGCoordinates(event);
    setMousePosition(coords);

    // Check for snap targets
    const snapTarget = findSnapTarget(coords);
    setSnapTarget(snapTarget);

    if (draggedVertex) {
      setIsDragging(true);
      const { polygonIndex, vertexIndex } = draggedVertex;

      // Use snap target coordinates if snapping
      const finalCoords = snapTarget ? snapTarget.vertex : coords;

      setPolygons(prev => prev.map((polygon, pIndex) => {
        if (pIndex === polygonIndex) {
          return polygon.map((vertex, vIndex) => {
            if (vIndex === vertexIndex) {
              return finalCoords;
            }
            return vertex;
          });
        }
        return polygon;
      }));
    }
  }, [getSVGCoordinates, draggedVertex, findSnapTarget]);

  // Handle SVG click for adding vertices
  const handleSVGClick = useCallback((event) => {
    if (draggedVertex || isDragging) return;

    const coords = getSVGCoordinates(event);

    // Deselect any selected polygon when clicking on empty space
    if (selectedPolygon !== null) {
      setSelectedPolygon(null);
    }

    // Check if we're clicking near the first point to close the polygon automatically
    if (currentPolygon.length >= 3 && isNearPoint(coords, currentPolygon[0], 20)) {
      // Close the polygon automatically
      const newPolygons = [...polygons, currentPolygon];
      setPolygons(newPolygons);
      setCurrentPolygon([]);
      setIsDrawing(false);
      setSnapTarget(null);
      // Save to history
      saveToHistory(newPolygons, []);
      return;
    }

    // Check for snap target for new vertex placement
    const snapTarget = findSnapTarget(coords);
    const finalCoords = snapTarget ? snapTarget.vertex : coords;

    // Add new vertex to current polygon
    const newCurrentPolygon = [...currentPolygon, finalCoords];
    setCurrentPolygon(newCurrentPolygon);
    setIsDrawing(true);
    // Save to history for vertex addition
    saveToHistory(polygons, newCurrentPolygon);
  }, [currentPolygon, draggedVertex, isDragging, selectedPolygon, polygons, getSVGCoordinates, isNearPoint, saveToHistory, findSnapTarget]);

  // Handle vertex mouse down for dragging
  const handleVertexMouseDown = useCallback((event, polygonIndex, vertexIndex) => {
    event.stopPropagation();
    event.preventDefault();
    setDraggedVertex({ polygonIndex, vertexIndex });
    setIsDragging(false); // Reset dragging flag
  }, []);

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    if (draggedVertex) {
      // Save to history after dragging is complete
      saveToHistory(polygons, currentPolygon);
    }
    setDraggedVertex(null);
    setSnapTarget(null); // Clear snap target when mouse up
    // Small timeout to prevent click event from firing immediately after drag
    setTimeout(() => {
      setIsDragging(false);
    }, 50);
  }, [draggedVertex, polygons, currentPolygon, saveToHistory]);

  // Handle polygon deletion
  const deletePolygon = useCallback((polygonIndex) => {
    const newPolygons = polygons.filter((_, index) => index !== polygonIndex);
    setPolygons(newPolygons);
    setSelectedPolygon(null);
    // Save to history
    saveToHistory(newPolygons, currentPolygon);
  }, [polygons, currentPolygon, saveToHistory]);

  // Handle polygon double-click for deletion
  const handlePolygonDoubleClick = useCallback((event, polygonIndex) => {
    event.stopPropagation();
    deletePolygon(polygonIndex);
  }, [deletePolygon]);

  // Handle polygon selection
  const handlePolygonClick = useCallback((event, polygonIndex) => {
    event.stopPropagation();
    setSelectedPolygon(selectedPolygon === polygonIndex ? null : polygonIndex);
  }, [selectedPolygon]);

  // Clear all polygons
  const clearAllPolygons = useCallback(() => {
    setPolygons([]);
    setCurrentPolygon([]);
    setSelectedPolygon(null);
    setIsDrawing(false);
    // Save to history
    saveToHistory([], []);
  }, [saveToHistory]);

  // Convert array of points to SVG path string
  const pointsToPath = (points) => {
    if (points.length === 0) return '';
    return points.map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    ).join(' ') + ' Z';
  };

  // Convert array of points to SVG polyline points string
  const pointsToPolyline = (points) => {
    return points.map(point => `${point.x},${point.y}`).join(' ');
  };

  // Generate random color for each polygon
  const getPolygonColor = (index) => {
    // Use the index as a seed for consistent colors per polygon
    const seed = index * 137.5; // Golden angle approximation for good color distribution

    // Generate HSL color for better color variety
    const hue = (seed % 360);
    const saturation = 60 + (seed % 40); // 60-100% saturation
    const lightness = 85; // Keep lightness high for fill transparency

    return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`;
  };

  const getPolygonStroke = (index) => {
    // Use the same seed as fill color but with different saturation/lightness
    const seed = index * 137.5;

    const hue = (seed % 360);
    const saturation = 70 + (seed % 30); // 70-100% saturation for stroke
    const lightness = 45 + (seed % 20); // 45-65% lightness for stroke

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
          Interactive Polygon Drawing Tool
        </h1>

        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Instructions:</h2>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Click to add vertices to create a polygon</li>
            <li>• Click anywhere near the starting point to close the polygon automatically</li>
            <li>• Vertices automatically snap to nearby existing vertices (orange indicator)</li>
            <li>• Drag any vertex to modify the shape of completed polygons</li>
            <li>• Click on a polygon to select it, then click the red X button to delete</li>
            <li>• Double-click any polygon to delete it quickly</li>
            <li>• Use Ctrl+Z (Cmd+Z) to undo, Ctrl+Y or Ctrl+Shift+Z (Cmd+Y or Cmd+Shift+Z) to redo</li>
            <li>• Create multiple polygons on the same canvas</li>
          </ul>
        </div>


        <div className="bg-white rounded-lg shadow-lg p-4 mb-6 flex justify-between items-center">
          {/* Undo/Redo Controls */}
          <div className="flex justify-center gap-2 mb-3">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`px-3 py-2 rounded-lg text-white transition-colors ${canUndo
                ? 'bg-blue-500 hover:bg-blue-600'
                : 'bg-gray-300 cursor-not-allowed'
                }`}
              title="Undo (Ctrl+Z)"
            >
              <img src={Undo} alt="Undo" className="w-5 h-5 inline-block" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`px-3 py-2 rounded-lg text-white transition-colors ${canRedo
                ? 'bg-blue-500 hover:bg-blue-600'
                : 'bg-gray-300 cursor-not-allowed'
                }`}
              title="Redo (Ctrl+Y)"
            >
              <img src={Redo} alt="Redo" className="w-5 h-5 inline-block" />
            </button>
          </div>
          <div>
            <p>Completed Polygons: {polygons.length}</p>
            {currentPolygon.length > 0 && (
              <p>Current Polygon: {currentPolygon.length} vertices</p>
            )}
          </div>
          <div>
            {/* Other Controls */}
            {(polygons.length > 0 || selectedPolygon !== null) && (
              <div className="flex justify-center gap-4">
                {polygons.length > 0 && (
                  <button
                    onClick={clearAllPolygons}
                    className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    title='Reset All Polygons'
                  >
                    <img src={Reset} alt="Reset" className="h-5 w-5 inline-block" />

                  </button>
                )}
                {selectedPolygon !== null && (
                  <button
                    onClick={() => deletePolygon(selectedPolygon)}
                    className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    title='Delete Selected Polygon'
                  >
                    <img src={Delete} alt="Delete" className="h-5 w-5 inline-block" />
                  </button>
                )}
              </div>
            )}
          </div>


        </div>
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <svg
            ref={svgRef}
            className="w-full cursor-crosshair border border-gray-200"
            width="100%"
            height="600"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleSVGClick}
          >
            {/* Render completed polygons */}
            {polygons.map((polygon, polygonIndex) => (
              <g key={polygonIndex}>
                {/* Filled polygon */}
                <path
                  d={pointsToPath(polygon)}
                  fill={getPolygonColor(polygonIndex)}
                  stroke={getPolygonStroke(polygonIndex)}
                  strokeWidth={selectedPolygon === polygonIndex ? "4" : "2"}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={(e) => handlePolygonClick(e, polygonIndex)}
                  onDoubleClick={(e) => handlePolygonDoubleClick(e, polygonIndex)}
                />

                {/* Vertices */}
                {polygon.map((vertex, vertexIndex) => (
                  <circle
                    key={vertexIndex}
                    cx={vertex.x}
                    cy={vertex.y}
                    r="6"
                    fill={getPolygonStroke(polygonIndex)}
                    stroke="white"
                    strokeWidth="2"
                    className="cursor-move hover:r-8 transition-all"
                    onMouseDown={(e) => handleVertexMouseDown(e, polygonIndex, vertexIndex)}
                    style={{ pointerEvents: 'all' }}
                  />
                ))}

                {/* Delete button for selected polygon */}
                {selectedPolygon === polygonIndex && (
                  <g>
                    {/* Calculate polygon center for delete button placement */}
                    {(() => {
                      const centerX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
                      const centerY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;
                      return (
                        <g>
                          {/* Delete button background */}
                          <circle
                            cx={centerX}
                            cy={centerY}
                            r="12"
                            fill="rgba(239, 68, 68, 0.9)"
                            stroke="white"
                            strokeWidth="2"
                            className="cursor-pointer hover:fill-red-600 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePolygon(polygonIndex);
                            }}
                          />
                          {/* Delete icon (X) */}
                          <g className="pointer-events-none">
                            <line
                              x1={centerX - 4}
                              y1={centerY - 4}
                              x2={centerX + 4}
                              y2={centerY + 4}
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                            <line
                              x1={centerX + 4}
                              y1={centerY - 4}
                              x2={centerX - 4}
                              y2={centerY + 4}
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </g>
                        </g>
                      );
                    })()}
                  </g>
                )}
              </g>
            ))}

            {/* Render current polygon being drawn */}
            {currentPolygon.length > 0 && (
              <g>
                {/* Current polygon lines */}
                <polyline
                  points={pointsToPolyline(currentPolygon)}
                  fill="none"
                  stroke="rgb(59, 130, 246)"
                  strokeWidth="2"
                  className="pointer-events-none"
                />

                {/* Preview line to mouse */}
                {isDrawing && (
                  <line
                    x1={currentPolygon[currentPolygon.length - 1].x}
                    y1={currentPolygon[currentPolygon.length - 1].y}
                    x2={snapTarget ? snapTarget.vertex.x : mousePosition.x}
                    y2={snapTarget ? snapTarget.vertex.y : mousePosition.y}
                    stroke="rgb(59, 130, 246)"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    className="pointer-events-none"
                  />
                )}

                {/* Preview line to close polygon */}
                {currentPolygon.length >= 3 && isNearPoint(mousePosition, currentPolygon[0], 20) && (
                  <line
                    x1={mousePosition.x}
                    y1={mousePosition.y}
                    x2={currentPolygon[0].x}
                    y2={currentPolygon[0].y}
                    stroke="rgb(34, 197, 94)"
                    strokeWidth="3"
                    strokeDasharray="3,3"
                    className="pointer-events-none"
                  />
                )}

                {/* Current polygon vertices */}
                {currentPolygon.map((vertex, index) => {
                  const isFirstVertex = index === 0;
                  const canClose = currentPolygon.length >= 3 && isFirstVertex && isNearPoint(mousePosition, vertex, 20);

                  return (
                    <g key={index}>
                      <circle
                        cx={vertex.x}
                        cy={vertex.y}
                        r={canClose ? "12" : "6"}
                        fill={canClose ? "rgb(34, 197, 94)" : "rgb(59, 130, 246)"}
                        stroke="white"
                        strokeWidth="2"
                        className="pointer-events-none"
                      />
                      {canClose && (
                        <>
                          {/* Inner pulsing circle */}
                          <circle
                            cx={vertex.x}
                            cy={vertex.y}
                            r="18"
                            fill="none"
                            stroke="rgb(34, 197, 94)"
                            strokeWidth="2"
                            strokeDasharray="3,3"
                            className="pointer-events-none animate-pulse"
                          />
                          {/* Outer click area indicator */}
                          <circle
                            cx={vertex.x}
                            cy={vertex.y}
                            r="20"
                            fill="rgba(34, 197, 94, 0.1)"
                            stroke="rgb(34, 197, 94)"
                            strokeWidth="1"
                            strokeDasharray="2,2"
                            className="pointer-events-none"
                          />
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Snap target indicator */}
            {snapTarget && (
              <g>
                {/* Snap indicator circle */}
                <circle
                  cx={snapTarget.vertex.x}
                  cy={snapTarget.vertex.y}
                  r="10"
                  fill="none"
                  stroke="rgb(255, 165, 0)"
                  strokeWidth="3"
                  className="pointer-events-none animate-pulse"
                />
                {/* Snap indicator cross */}
                <g className="pointer-events-none">
                  <line
                    x1={snapTarget.vertex.x - 6}
                    y1={snapTarget.vertex.y}
                    x2={snapTarget.vertex.x + 6}
                    y2={snapTarget.vertex.y}
                    stroke="rgb(255, 165, 0)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line
                    x1={snapTarget.vertex.x}
                    y1={snapTarget.vertex.y - 6}
                    x2={snapTarget.vertex.x}
                    y2={snapTarget.vertex.y + 6}
                    stroke="rgb(255, 165, 0)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </g>
              </g>
            )}
          </svg>
        </div>

        {/* Stats and Controls */}
        <div className="mt-4 text-center">
          <div className="text-sm text-gray-600 mb-3">

            {currentPolygon.length >= 3 && isNearPoint(mousePosition, currentPolygon[0], 20) && (
              <p className="text-green-600 font-semibold animate-pulse">
                Click anywhere in the green area to close the polygon!
              </p>
            )}
            {snapTarget && (
              <p className="text-orange-600 font-semibold">
                Vertex snapping active - Will snap to nearby vertex
              </p>
            )}
            {selectedPolygon !== null && (
              <p className="text-blue-600 font-semibold">
                Polygon {selectedPolygon + 1} selected - Click the red X to delete
              </p>
            )}
          </div>




        </div>
      </div>
    </div>
  );
}

export default App;
