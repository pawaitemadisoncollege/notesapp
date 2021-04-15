import logo from './logo.svg';
import './App.css';

import 
  React
  , {
      useEffect
      , useReducer
    } 
from 'react'

import { API } from 'aws-amplify'
import 'antd/dist/antd.css'
import { listNotes } from './graphql/queries'
import { v4 as uuid } from 'uuid'
import { 
  List
  , Input
  , Button 
} from 'antd';

import {
  updateNote as UpdateNote
  ,createNote as CreateNote
  , deleteNote as DeleteNote 
} from './graphql/mutations';
import { PresetStatusColorTypes } from 'antd/lib/_util/colors';
import { onCreateNote } from './graphql/subscriptions'

const CLIENT_ID = uuid();

const initialState = {
  notes: []
  , loading: true
  , error: false
  , form: { 
      name: ''
      , description: '' 
  }
}

const reducer = (state, action) => {
  switch(action.type) {
    case 'ADD_NOTE':
      return {
        ...state 
        , notes: [
          action.note  // adds a note to the top of the list
          , ...state.notes
        ]
      };
    case 'RESET_FORM':
      return {
        ...state
        , form: initialState.form
      };
    case 'SET_INPUT':
      return {
        ...state
        , form: {
          ...state.form
          , [action.name]: action.value
        }
      };
    case 'SET_NOTES':
      return { 
        ...state
        , notes: action.notes
        , loading: false 
      };
    case 'ERROR':
      return { 
        ...state
        , loading: false
        , error: true 
      };
    default:
      return {
        ...state
      };
  }
};

const App = () => {

  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchNotes = async() => {
    try {
      const notesData = await API.graphql({
        query: listNotes
      });
      dispatch({
        type: 'SET_NOTES'
        , notes: notesData.data.listNotes.items.sort((a, b) => a.name < b.name ? -1 : 1) 
      });
    } catch (err) {
      console.error(err);
      dispatch({
        type: "ERROR"
      });
    }
  };

  useEffect(  //takes two params - a lambda and an empty array
    () => {
      fetchNotes();
      const subscription = API.graphql(   // subscription does not return a promise
        {
          query: onCreateNote
        }
      ).subscribe( // function that takes an object. Object has a next property
        {  
          next: noteData => {  // next property is a lamda function that goes to multiple statements
            const note = noteData.value.data.onCreateNote // get the note from the subscription payload
            // how would you know what is all on noteData? console.log it!
            if (CLIENT_ID === note.clientId) {
              return; // bail if this instance of the app caused this subscription notification
            }
            dispatch({ //otherwise, update the state
              type: 'ADD_NOTE'
              , note 
            });
        }
      });
      return () => subscription.unsubscribe(); // clean up
    }
    , []
  );

  const styles = {
    container: {
      padding: 20
    }
    , input: {
      marginBottom: 10
    }
    , item: { 
      textAlign: 'left' 
    }
    , p: { 
      color: '#1890ff' 
    }
  }  

  const renderItem = (item) => {
    return (
      <List.Item style={styles.item}
      actions={[
        <p 
          style={styles.p} 
          onClick={() => deleteNote(item)}
        >
          Delete
        </p>,
        <p 
        style={styles.p} 
        onClick={() => updateNote(item)}
        >
          {item.completed ? 'mark incomplete' : 'mark completed'}
        </p>
      ]}>

      <List.Item.Meta
        //title={item.name + (item.completed ? ' (completed)' : '')}
        // tick string: evaluates as js expression
        title={`${item.name} ${item.completed ? ' (completed)' : ''}`}
        description={item.description}
      />
    </List.Item>
          )
        };

  const createNote = async () => {
    const { form } = state  // destructuring pulling form element out of state

    if (!form.name || !form.description) {
      return alert('please enter a name and description')
    }

    const note = { 
      ...form
      , clientId: CLIENT_ID
      , completed: false
      , id: uuid() // generating id locally
    }
    
    //optimistic dispatch, updates local app state before calling graphql
    dispatch({ 
      type: 'ADD_NOTE'
      , note // shorthand for note: note if property name and value are same, can short cut
    });
    
    dispatch({ 
      type: 'RESET_FORM' 
    });
    
    try {
      await API.graphql({
        query: CreateNote,
        variables: { input: note }
      })
      console.log('successfully created note!')
    } catch (err) {
      console.error("error: ", err)
    }
  };

  const updateNote = async(noteToUpdate) => {
    //update the state (optimistic)
    dispatch({ 
      type: 'SET_NOTES'
      , notes: state.notes.map(x => ({
        ...x
        , completed: x == noteToUpdate ? !x.completed : x.completed //ternary 

      }))  // map over each note and when i get to the one I want, switch the completed state.
    });

    // update the back end
    try {
      await API.graphql({
        query: UpdateNote
        , variables: { 
          input: { 
            id: noteToUpdate.id
            , completed: !noteToUpdate.completed 
          } 
        }
      })
      console.log('note successfully updated!')
    } catch (err) {
      console.error('error: ', err)
    }
  };

  const deleteNote = async(noteToDelete) => {
    //optimistically update state with the note removed
    // tom code:
    dispatch({
      type:"SET_NOTES"
      , notes: state.notes.filter(x => x != noteToDelete)

    });

    // author code:
    // const index = state.notes.findIndex(n => n.id === id)
    // const notes = [
    //   ...state.notes.slice(0, index),
    //   ...state.notes.slice(index + 1)];
    // dispatch({ type: 'SET_NOTES', notes })

    //call the backend to make the change
    try {
      await API.graphql({
        query: DeleteNote
        , variables: { 
          input: {
            id: noteToDelete.id 
          }
        }
      })
      console.log('successfully deleted note!')
      } catch (err) {
        console.error(err)
    }
  };

  const onChange = (e) => {
    dispatch({
      type: 'SET_INPUT'
      , name: e.target.name
      , value: e.target.value
    });
  };

  return (
    <div style={styles.container}>
      <Input
        onChange={onChange}
        value={state.form.name}
        placeholder="Enter note name"
        name='name'
        style={styles.input}
      />
      <Input
        onChange={onChange}
        value={state.form.description}
        placeholder="Enter note description"
        name='description'
        style={styles.input}
      />
      <Button
        onClick={createNote}
        type="primary"
      >Create Note</Button>
      <List
        loading={state.loading}
        dataSource={state.notes}
        renderItem={renderItem}
      />
    </div>
  )

};

export default App;
